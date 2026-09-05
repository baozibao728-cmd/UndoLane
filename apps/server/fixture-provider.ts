import type { AssistantMessage, Message, ModelProvider } from '../../packages/agent/provider.ts';
import { outputs } from '../../packages/mcp-server/schemas.ts';

// Fixed, explicitly labeled demo recipe. It still runs the unchanged Agent Runner
// and real MCP tools; every value and revision comes from actual tool responses.
export class FixtureProvider implements ModelProvider {
  private round = 0;
  async complete(messages: Message[]): Promise<AssistantMessage> {
    await new Promise(resolve => setTimeout(resolve, 350));
    const call = (id: string, name: string, args: unknown) => ({ id, type: 'function' as const,
      function: { name, arguments: JSON.stringify(args) } });
    const data = messages.filter(m => m.role === 'tool').map(m => JSON.parse(m.content));
    switch (this.round++) {
      case 0: return { role: 'assistant', content: null, tool_calls: [call('list', 'assets_list', {})] };
      case 1: {
        const assets = outputs.assets_list.parse(data[0]).resources.filter(a => a.status === 'approved').slice(0, 4);
        if (!assets.length) return { role: 'assistant', content: 'No approved assets were found. No changes were made.' };
        return { role: 'assistant', content: null, tool_calls: assets.map(a => call(`get-${a.resource_id}`, 'asset_get', { resource_id: a.resource_id })) };
      }
      case 2: {
        const assets = data.slice(1).map(d => outputs.asset_get.parse(d));
        return { role: 'assistant', content: null, tool_calls: assets.map(a => call(`patch-${a.resource_id}`, 'asset_patch', {
          resource_id: a.resource_id, writes: [
            { field: 'campaign', value: 'Autumn Launch', expected_revision: a.revision.campaign },
            { field: 'display_name', value: a.display_name?.startsWith('Autumn ') ? a.display_name : `Autumn ${a.display_name ?? a.resource_id}`, expected_revision: a.revision.display_name },
          ],
        })) };
      }
      default: return { role: 'assistant', content: 'The fixed demo recipe has finished. Review the recorded actions below.' };
    }
  }
}
