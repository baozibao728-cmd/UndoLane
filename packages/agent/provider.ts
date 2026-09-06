import * as z from 'zod/v4';

const toolCallSchema = z.object({ id: z.string().min(1), type: z.literal('function'),
  function: z.object({ name: z.string().min(1), arguments: z.string() }) });
const messageSchema = z.object({ role: z.literal('assistant'), content: z.string().nullable().optional(),
  // Compatible providers may encode "no tool calls" as null on a final answer.
  tool_calls: z.array(toolCallSchema).nullable().transform(calls => calls ?? undefined).optional() });
const responseSchema = z.object({ choices: z.array(z.object({ message: messageSchema,
  finish_reason: z.string().nullable() })).min(1) });
export type AssistantMessage = z.infer<typeof messageSchema>;
export type Message = { role: 'system' | 'user'; content: string } | AssistantMessage |
  { role: 'tool'; tool_call_id: string; content: string };
export interface ToolDefinition {
  type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> };
}
export interface ModelProvider {
  complete(messages: Message[], tools: ToolDefinition[]): Promise<AssistantMessage>;
}
export interface ProviderConfig { baseUrl: string; model: string; apiKey: string; timeoutMs?: number }
export class AgentError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'AgentError'; this.code = code; }
}
export function providerConfig(env: NodeJS.ProcessEnv = process.env): ProviderConfig {
  const baseUrl = env.UNDOLANE_BASE_URL?.trim(); const model = env.UNDOLANE_MODEL?.trim();
  const apiKey = env.UNDOLANE_API_KEY?.trim();
  if (!baseUrl || !model || !apiKey) throw new AgentError('MODEL_CONFIG_REQUIRED');
  return { baseUrl, model, apiKey };
}
export class OpenAICompatibleProvider implements ModelProvider {
  private endpoint: string;
  private config: ProviderConfig;
  constructor(config: ProviderConfig) {
    this.config = config;
    const url = new URL(config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new AgentError('INVALID_BASE_URL');
    if (!config.model.trim() || !config.apiKey.trim()) throw new AgentError('MODEL_CONFIG_REQUIRED');
    this.endpoint = new URL('chat/completions', url).href;
  }
  async complete(messages: Message[], tools: ToolDefinition[]): Promise<AssistantMessage> {
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.config.model, messages, tools, tool_choice: 'auto',
          stream: false, max_tokens: 2048 }),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 60_000),
      });
    } catch { throw new AgentError('MODEL_UNAVAILABLE'); }
    // Never surface provider response bodies, URLs or headers: they may contain credentials.
    if (!response.ok) { await response.body?.cancel(); throw new AgentError(`MODEL_HTTP_${response.status}`); }
    let parsed: z.infer<typeof responseSchema>;
    try { parsed = responseSchema.parse(await response.json()); }
    catch { throw new AgentError('INVALID_MODEL_RESPONSE'); }
    const choice = parsed.choices[0];
    if (!['stop', 'tool_calls'].includes(choice.finish_reason ?? '')) throw new AgentError('INCOMPLETE_MODEL_RESPONSE');
    const message = choice.message;
    if (choice.finish_reason === 'tool_calls' && !message.tool_calls?.length) throw new AgentError('INVALID_MODEL_RESPONSE');
    return message;
  }
}
