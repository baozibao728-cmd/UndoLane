import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { UndoEngine } from '../packages/engine/index.ts';
import { outputs } from '../packages/mcp-server/schemas.ts';
import { connectUndoLane } from '../packages/agent/mcp.ts';
import { runAgent } from '../packages/agent/runner.ts';
import { OpenAICompatibleProvider, providerConfig, type Message, type ToolDefinition } from '../packages/agent/provider.ts';

// Scripted HTTP responses are a MOCK model. MCP and SQLite are real.
type RequestBody = { model: string; messages: Message[]; tools: ToolDefinition[] };
type Reply = { calls?: Array<{ id: string; name: string; args: unknown }>; content?: string; status?: number; body?: unknown };
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function mockProvider(replies: Reply[], inspect?: (body: RequestBody) => void) {
  const requests: RequestBody[] = [];
  const paths: string[] = [];
  const server: Server = createServer((request, response) => {
    let data = '';
    request.on('data', chunk => { data += String(chunk); });
    request.on('end', () => {
      try {
        expect(request.headers.authorization).toBe('Bearer mock-key-not-a-secret');
        expect(request.method).toBe('POST'); paths.push(request.url ?? '');
        const body = JSON.parse(data) as RequestBody; requests.push(body); inspect?.(body);
        const reply = replies[requests.length - 1] ?? { status: 500 };
        response.writeHead(reply.status ?? 200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(reply.body ?? { choices: [{ finish_reason: reply.calls?.length ? 'tool_calls' : 'stop',
          message: { role: 'assistant', content: reply.content ?? null,
            ...(reply.calls ? { tool_calls: reply.calls.map(c => ({ id: c.id, type: 'function',
              function: { name: c.name, arguments: JSON.stringify(c.args) } })) } : {}) } }] }));
      } catch { response.writeHead(500); response.end('{}'); }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
  }));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No mock port');
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  return { requests, paths, baseUrl, provider: new OpenAICompatibleProvider({
    baseUrl, model: 'mock-tool-model', apiKey: 'mock-key-not-a-secret', timeoutMs: 2000,
  }) };
}
async function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'undolane-agent-'));
  const path = join(dir, 'test.sqlite'); const engine = new UndoEngine(path);
  for (const [i, id] of ['asset_a', 'asset_b', 'asset_c'].entries()) engine.createResource(id, {
    display_name: `Cake 0${i + 1}`, campaign: null, status: i < 2 ? 'approved' : 'unapproved', note: '',
  });
  const db = new Database(path, { readonly: true });
  const client = await connectUndoLane(path);
  cleanups.push(async () => { await client.close(); db.close(); engine.close(); rmSync(dir, { recursive: true, force: true }); });
  return { engine, db, client };
}
const list = { id: 'list-1', name: 'assets_list', args: {} };
const patch = (id: string, resourceId: string, value: string) => ({ id, name: 'asset_patch', args: {
  resource_id: resourceId, writes: [{ field: 'campaign', value, expected_revision: 0 }],
} });
describe('Agent Runner: MOCK Chat Completions → real MCP → real SQLite', () => {
  it('accepts a MiMo final response with null tool_calls after a recorded write', async () => {
    const { client, db } = await workspace();
    const mock = await mockProvider([{ calls: [list] }, { calls: [patch('p', 'asset_a', 'Autumn')] },
      { body: { choices: [{ finish_reason: 'stop', message: {
        role: 'assistant', content: 'Done.', tool_calls: null, reasoning_content: 'Provider metadata',
      } }] } }]);
    const report = await runAgent(client, mock.provider, 'Prepare assets');
    expect(report).toMatchObject({ status: 'completed', modelSummary: 'Done.', modelCalls: 3, toolCalls: 2 });
    expect(report.actions).toHaveLength(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM actions').get()).toEqual({ n: 1 });
    expect(mock.requests).toHaveLength(3);
  });
  it('still rejects a tool_calls finish reason with a null call list', async () => {
    const mock = await mockProvider([{ body: { choices: [{ finish_reason: 'tool_calls',
      message: { role: 'assistant', content: null, tool_calls: null } }] } }]);
    await expect(mock.provider.complete([{ role: 'user', content: 'Test' }], [])).rejects.toThrow('INVALID_MODEL_RESPONSE');
  });
  it('runs the shipped Demo CLI with a mock HTTP model and an explicit Human title', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'undolane-demo-cli-'));
    cleanups.push(async () => { rmSync(dir, { recursive: true, force: true }); });
    const mock = await mockProvider([{ calls: [list] }, { calls: ['asset_a', 'asset_b'].map((resource, i) => ({
      id: `patch-${i}`, name: 'asset_patch', args: { resource_id: resource, writes: [
        { field: 'campaign', value: 'Autumn Launch', expected_revision: 0 },
        { field: 'display_name', value: `Autumn Cake 0${i + 1}`, expected_revision: 0 },
      ] },
    })) }, { content: 'Prepared approved assets.' }]);
    const { stdout } = await promisify(execFile)(process.execPath, [
      fileURLToPath(new URL('../scripts/agent-demo.ts', import.meta.url)), '--db', join(dir, 'demo.sqlite'),
      '--human-value', 'Hero — Final',
    ], { windowsHide: true, timeout: 20_000, env: { ...process.env,
      UNDOLANE_BASE_URL: mock.baseUrl, UNDOLANE_MODEL: 'mock-tool-model', UNDOLANE_API_KEY: 'mock-key-not-a-secret',
    } });
    expect(stdout).toContain('VERIFIED:'); expect(stdout).toContain('A newer human edit owns this field');
    const verified = JSON.parse(stdout.split('VERIFIED:')[1]) as { restored: number; protected: number; humanTitle: string };
    expect(verified).toMatchObject({ restored: 3, protected: 1, humanTitle: 'Hero — Final' });
    expect(mock.requests).toHaveLength(3);
  });
  it('runs the full multi-field Agent / Human / conditional undo sequence', async () => {
    const { client, db, engine } = await workspace();
    const mock = await mockProvider([
      { calls: [list] },
      { calls: [{ id: 'get-1', name: 'asset_get', args: { resource_id: 'asset_b' } }] },
      { calls: [patch('patch-a', 'asset_a', 'Autumn Launch'), { id: 'patch-b', name: 'asset_patch', args: {
        resource_id: 'asset_b', writes: [{ field: 'campaign', value: 'Autumn Launch', expected_revision: 0 },
          { field: 'display_name', value: 'Autumn Cake 02', expected_revision: 0 }],
      } }] },
      { content: 'Prepared the approved assets.' },
    ]);
    const report = await runAgent(client, mock.provider, 'Prepare approved assets for Autumn Launch');
    expect(report).toMatchObject({ status: 'completed', modelCalls: 4, toolCalls: 4 });
    expect(report.events.map(e => e.name)).toEqual(['assets_list', 'asset_get', 'asset_patch', 'asset_patch']);
    expect(report.actions).toHaveLength(2); expect(report.actions.flatMap(a => a.effects)).toHaveLength(3);
    expect(db.prepare('SELECT actor_kind,actor_id FROM actions').all()).toEqual([
      { actor_kind: 'agent', actor_id: 'mcp-agent' }, { actor_kind: 'agent', actor_id: 'mcp-agent' },
    ]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM effects').get()).toEqual({ n: 3 });
    expect(mock.paths.every(p => p === '/v1/chat/completions')).toBe(true);
    expect(mock.requests[0].model).toBe('mock-tool-model');
    expect(mock.requests[0].tools.map(t => t.function.name)).toEqual(['assets_list', 'asset_get', 'asset_patch']);
    const modelPatchSchema = mock.requests[0].tools[2].function.parameters;
    expect(modelPatchSchema.properties).not.toHaveProperty('operation_key');
    expect(mock.requests.at(-1)!.messages.filter(m => m.role === 'tool')).toHaveLength(4);
    const originalEffects = report.actions.map(a => engine.getEffects(a.action_id));
    engine.applyAction('human', 'user', 'manual-title', [{ resourceId: 'asset_b', field: 'display_name',
      expectedRevision: 1, afterPresent: true, afterValue: 'Hero — Final' }]);
    const humanState = engine.getField('asset_b', 'display_name');
    let protectedCount = 0;
    for (const action of [...report.actions].reverse()) {
      const plan = outputs.undo_preview.parse((await client.callTool({ name: 'undo_preview', arguments: { action_id: action.action_id } })).structuredContent);
      for (const item of plan.items.filter(i => i.decision === 'protected')) {
        expect(item.reason).toBe('A newer human edit owns this field'); protectedCount++;
      }
      const receipt = await client.callTool({ name: 'undo_commit', arguments: { undo_plan_id: plan.undo_plan_id } });
      expect(receipt.isError).not.toBe(true);
    }
    expect(protectedCount).toBe(1);
    expect(engine.getField('asset_b', 'display_name')).toEqual(humanState);
    expect(humanState.value).toBe('Hero — Final');
    for (const id of ['asset_a', 'asset_b']) expect(engine.getField(id, 'campaign')).toMatchObject({ value: null, revision: 2, activeEffectId: null });
    expect(engine.getField('asset_c', 'campaign')).toMatchObject({ value: null, revision: 0 });
    expect(report.actions.map(a => engine.getEffects(a.action_id))).toEqual(originalEffects);
    expect(db.prepare('SELECT COUNT(*) AS n FROM compensations').get()).toEqual({ n: 2 });
  });
  it('rejects an unadvertised undo tool before any tool in its response batch writes', async () => {
    const { client, db } = await workspace();
    const mock = await mockProvider([{ calls: [list] }, { calls: [patch('p', 'asset_a', 'Autumn'),
      { id: 'u', name: 'undo_commit', args: { undo_plan_id: 'made-up' } }] }]);
    const report = await runAgent(client, mock.provider, 'Prepare approved assets');
    expect(report.errorCode).toBe('TOOL_NOT_ALLOWED');
    expect(db.prepare('SELECT COUNT(*) AS n FROM actions').get()).toEqual({ n: 0 });
  });
  it('requires observed revisions before writes and allows one argument correction', async () => {
    const { client, db } = await workspace();
    const mock = await mockProvider([{ calls: [patch('blind', 'asset_a', 'Autumn')] }, { calls: [list] },
      { calls: [patch('corrected', 'asset_a', 'Autumn')] }, { content: 'Done' }]);
    const report = await runAgent(client, mock.provider, 'Prepare assets');
    expect(report.status).toBe('completed'); expect(report.events[0].errorCode).toBe('READ_REQUIRED');
    expect(db.prepare('SELECT COUNT(*) AS n FROM actions').get()).toEqual({ n: 1 });
  });
  it('reports a real revision conflict instead of overwriting an intervening Human edit', async () => {
    const { client, engine, db } = await workspace(); let requests = 0;
    const mock = await mockProvider([{ calls: [list] }, { calls: [patch('p', 'asset_a', 'Autumn')] }, { content: 'Conflict, left unchanged.' }], () => {
      if (++requests === 2) engine.applyAction('human', 'user', 'intervening', [{ resourceId: 'asset_a', field: 'campaign',
        expectedRevision: 0, afterPresent: true, afterValue: 'Human campaign' }]);
    });
    const report = await runAgent(client, mock.provider, 'Prepare assets');
    expect(report.events.at(-1)).toMatchObject({ ok: false, errorCode: 'REVISION_CONFLICT' });
    expect(report.actions).toHaveLength(0); expect(engine.getField('asset_a', 'campaign').value).toBe('Human campaign');
    expect(db.prepare("SELECT COUNT(*) AS n FROM actions WHERE actor_kind='agent'").get()).toEqual({ n: 0 });
  });
  it('preserves successful Action receipts when the provider fails later, without replay', async () => {
    const { client, engine, db } = await workspace();
    const mock = await mockProvider([{ calls: [list] }, { calls: [patch('p', 'asset_a', 'Autumn')] },
      { status: 503, body: { error: 'private provider response must not leak' } }]);
    const report = await runAgent(client, mock.provider, 'Prepare assets');
    expect(report).toMatchObject({ status: 'failed', errorCode: 'MODEL_HTTP_503' });
    expect(report.actions).toHaveLength(1); expect(engine.getField('asset_a', 'campaign').value).toBe('Autumn');
    expect(db.prepare('SELECT COUNT(*) AS n FROM actions').get()).toEqual({ n: 1 });
    expect(JSON.stringify(report)).not.toContain('private provider'); expect(mock.requests).toHaveLength(3);
  });
  it('bounds model rounds and tool batches without producing writes', async () => {
    const { client, db } = await workspace();
    const repeating = await mockProvider(Array.from({ length: 6 }, (_, i) => ({ calls: [{ ...list, id: `list-${i}` }] })));
    const report = await runAgent(client, repeating.provider, 'Inspect assets');
    expect(report).toMatchObject({ errorCode: 'MODEL_BUDGET_EXCEEDED', modelCalls: 6 });
    const excess = await mockProvider([{ calls: Array.from({ length: 13 }, (_, i) => ({ ...list, id: `l-${i}` })) }]);
    expect((await runAgent(client, excess.provider, 'Inspect assets')).errorCode).toBe('TOOL_BUDGET_EXCEEDED');
    expect(db.prepare('SELECT COUNT(*) AS n FROM actions').get()).toEqual({ n: 0 });
  });
  it('does not treat a model success claim as a recorded database Action', async () => {
    const { client, db } = await workspace(); const mock = await mockProvider([{ content: 'I updated every asset!' }]);
    const report = await runAgent(client, mock.provider, 'Prepare assets');
    expect(report.actions).toEqual([]); expect(report.modelSummary).toBe('I updated every asset!');
    expect(db.prepare('SELECT COUNT(*) AS n FROM actions').get()).toEqual({ n: 0 });
  });
  it('rejects truncated tool responses and malformed model payloads', async () => {
    const { client } = await workspace();
    const truncated = await mockProvider([{ body: { choices: [{ finish_reason: 'length', message: { role: 'assistant',
      tool_calls: [{ id: 'p', type: 'function', function: { name: 'asset_patch', arguments: '{}' } }] } }] } }]);
    expect((await runAgent(client, truncated.provider, 'Prepare assets')).errorCode).toBe('INCOMPLETE_MODEL_RESPONSE');
    const invalid = await mockProvider([{ body: { choices: [] } }]);
    expect((await runAgent(client, invalid.provider, 'Prepare assets')).errorCode).toBe('INVALID_MODEL_RESPONSE');
  });
  it('stops duplicate writes and repeated tool-call IDs, keeping the first physical write', async () => {
    const { client, engine } = await workspace();
    const duplicate = await mockProvider([{ calls: [list] }, { calls: [patch('p1', 'asset_a', 'One')] },
      { calls: [{ id: 'p2', name: 'asset_patch', args: { resource_id: 'asset_a',
        writes: [{ field: 'campaign', value: 'Two', expected_revision: 1 }] } }] }]);
    expect((await runAgent(client, duplicate.provider, 'Prepare assets')).errorCode).toBe('FIELD_ALREADY_WRITTEN');
    expect(engine.getField('asset_a', 'campaign')).toMatchObject({ value: 'One', revision: 1 });
    const ids = await mockProvider([{ calls: [list, list] }]);
    expect((await runAgent(client, ids.provider, 'Inspect')).errorCode).toBe('DUPLICATE_TOOL_CALL_ID');
  });
  it('requires explicit environment configuration without a baked-in Key or model', () => {
    expect(() => providerConfig({})).toThrow('MODEL_CONFIG_REQUIRED');
    expect(providerConfig({ UNDOLANE_API_KEY: 'local-test', UNDOLANE_MODEL: 'chosen-model', UNDOLANE_BASE_URL: 'https://example.com/v1' }))
      .toEqual({ apiKey: 'local-test', model: 'chosen-model', baseUrl: 'https://example.com/v1' });
  });
});
