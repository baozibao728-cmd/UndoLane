import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UndoEngine } from '../packages/engine/index.ts';
import { outputs } from '../packages/mcp-server/schemas.ts';
import { write } from '../scripts/scenario.ts';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const entry = fileURLToPath(new URL('../packages/mcp-server/stdio.ts', import.meta.url));
async function setup(seedDemo = false) {
  const dir = mkdtempSync(join(tmpdir(), 'undolane-mcp-'));
  const path = join(dir, 'test.sqlite');
  const engine = new UndoEngine(path);
  if (!seedDemo) for (const [i, id] of ['asset_a', 'asset_b', 'asset_c'].entries()) {
    engine.createResource(id, { display_name: `Cake 0${i + 1}`, campaign: null, status: 'draft', note: '' });
  }
  const db = new Database(path, { readonly: true });
  const clients: Client[] = [];
  async function connect() {
    const client = new Client({ name: 'undolane-integration-test', version: '1.0.0' });
    clients.push(client);
    await client.connect(new StdioClientTransport({ command: process.execPath,
      args: [entry, '--db', path, ...(seedDemo ? ['--seed-demo'] : [])], cwd: dir }));
    return client;
  }
  cleanups.push(async () => {
    for (const client of clients) await client.close();
    db.close(); engine.close(); rmSync(dir, { recursive: true, force: true });
  });
  const client = await connect();
  // Discovery also makes the SDK validate subsequent structured outputs against schemas.
  const tools = await client.listTools();
  return { engine, db, client, tools, connect };
}
function patchArguments() {
  return { resource_id: 'asset_b', operation_key: 'batch-1', writes: [
    { field: 'campaign', value: 'Autumn Launch', expected_revision: 0 },
    { field: 'display_name', value: 'Autumn Cake 02', expected_revision: 0 },
  ] };
}
async function patch(client: Client) {
  const result = await client.callTool({ name: 'asset_patch', arguments: patchArguments() });
  expect(result.isError).not.toBe(true);
  return outputs.asset_patch.parse(result.structuredContent);
}
async function preview(client: Client, actionId: string) {
  const result = await client.callTool({ name: 'undo_preview', arguments: { action_id: actionId } });
  expect(result.isError).not.toBe(true);
  return outputs.undo_preview.parse(result.structuredContent);
}
async function commit(client: Client, planId: string) {
  const result = await client.callTool({ name: 'undo_commit', arguments: { undo_plan_id: planId } });
  expect(result.isError).not.toBe(true);
  return outputs.undo_commit.parse(result.structuredContent);
}
describe('MCP stdio integration (real child process + SQLite)', () => {
  it('discovers exactly five tools and reads coherent resource values, field revisions and initial history', async () => {
    const { client, tools } = await setup(true);
    expect(tools.tools.map(t => t.name).sort()).toEqual(['asset_get', 'asset_patch', 'assets_list', 'undo_commit', 'undo_preview']);
    expect(tools.tools.every(t => t.inputSchema && t.outputSchema)).toBe(true);
    const listed = outputs.assets_list.parse((await client.callTool({ name: 'assets_list', arguments: {} })).structuredContent);
    expect(listed.resources.map(a => a.resource_id)).toEqual(['asset_a', 'asset_b', 'asset_c']);
    expect(listed.resources[0]).toMatchObject({ display_name: 'Cake 01', campaign: null, revision: { campaign: 0 } });
    const asset = outputs.asset_get.parse((await client.callTool({ name: 'asset_get', arguments: { resource_id: 'asset_a' } })).structuredContent);
    expect(asset).toMatchObject({ note: '', active_effect_id: { campaign: null }, recent_modifications: { campaign: null } });
  });
  it('MCP patches create Agent Action and Effects with durable idempotency and actual ownership', async () => {
    const { client, db, engine } = await setup(); const action = await patch(client);
    expect(action.actor_kind).toBe('agent'); expect(action.effects).toHaveLength(2);
    expect(db.prepare('SELECT actor_kind,actor_id FROM actions WHERE id=?').get(action.action_id)).toEqual({ actor_kind: 'agent', actor_id: 'mcp-agent' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM effects WHERE action_id=?').get(action.action_id)).toEqual({ n: 2 });
    expect(action.effects[0]).toMatchObject({ before_value: null, after_value: 'Autumn Launch', before_revision: 0, after_revision: 1 });
    expect(engine.getField('asset_b', 'campaign').activeEffectId).toBe(action.effects[0].effect_id);
    expect(await patch(client)).toEqual(action);
    expect(db.prepare('SELECT COUNT(*) AS n FROM actions').get()).toEqual({ n: 1 });
    const asset = outputs.asset_get.parse((await client.callTool({ name: 'asset_get', arguments: { resource_id: 'asset_b' } })).structuredContent);
    expect(asset.recent_modifications.campaign).toMatchObject({ kind: 'effect', action_id: action.action_id, actor_kind: 'agent' });
  });
  it('preview protects a newer Human edit with the exact required reason', async () => {
    const { client, engine } = await setup(); const action = await patch(client);
    engine.applyAction('human', 'user', 'human-title', [write(engine, 'asset_b', 'display_name', 'Hero — Final')]);
    const plan = await preview(client, action.action_id);
    expect(plan).toMatchObject({ eligible: 1, protected: 1, blocked: 0 });
    expect(plan.items.find(i => i.field === 'display_name')).toMatchObject({ decision: 'protected', can_undo: false,
      current_value: 'Hero — Final', reason: 'A newer human edit owns this field' });
  });
  it('commit restores Agent fields, preserves Human changes and exposes a compensation as the latest mutation', async () => {
    const { client, engine, db } = await setup(); const action = await patch(client);
    engine.applyAction('human', 'user', 'human-title', [write(engine, 'asset_b', 'display_name', 'Hero — Final')]);
    engine.applyAction('human', 'user', 'human-note', [write(engine, 'asset_b', 'note', 'Keep this note')]);
    const title = engine.getField('asset_b', 'display_name'); const history = engine.getEffects(action.action_id);
    const plan = await preview(client, action.action_id); const receipt = await commit(client, plan.undo_plan_id);
    expect(receipt.status).toBe('partially_undone'); expect(receipt.restored).toHaveLength(1);
    expect(engine.getField('asset_b', 'campaign')).toMatchObject({ value: null, revision: 2, activeEffectId: null });
    expect(engine.getField('asset_b', 'display_name')).toEqual(title);
    expect(engine.getField('asset_b', 'note').value).toBe('Keep this note');
    expect(engine.getEffects(action.action_id)).toEqual(history);
    expect(db.prepare('SELECT COUNT(*) AS n FROM compensations').get()).toEqual({ n: 1 });
    const asset = outputs.asset_get.parse((await client.callTool({ name: 'asset_get', arguments: { resource_id: 'asset_b' } })).structuredContent);
    expect(asset.recent_modifications.campaign).toMatchObject({ kind: 'compensation', undo_commit_id: receipt.undo_commit_id, before_revision: 1, after_revision: 2 });
    expect(asset.recent_modifications.display_name).toMatchObject({ kind: 'effect', actor_kind: 'human' });
  });
  it('saved plan and commit retries survive MCP process restart and later writes', async () => {
    const { client, connect, engine, db } = await setup(); const action = await patch(client);
    const plan = await preview(client, action.action_id);
    await client.close(); const restarted = await connect();
    const receipt = await commit(restarted, plan.undo_plan_id);
    engine.applyAction('human', 'user', 'later', [write(engine, 'asset_b', 'campaign', 'Winter')]);
    const revision = engine.workspaceRevision;
    await restarted.close(); const retried = await connect();
    expect(await commit(retried, plan.undo_plan_id)).toEqual(receipt);
    expect(engine.workspaceRevision).toBe(revision); expect(engine.getField('asset_b', 'campaign').value).toBe('Winter');
    expect(db.prepare('SELECT COUNT(*) AS n FROM undo_commits').get()).toEqual({ n: 1 });
    expect((await preview(retried, action.action_id)).already_undone).toBe(2);
  });
  it('rejects stale preview from a Human write with zero undo mutations', async () => {
    const { client, engine, db } = await setup(); const action = await patch(client);
    const plan = await preview(client, action.action_id);
    engine.applyAction('human', 'user', 'unrelated', [write(engine, 'asset_a', 'note', 'Later')]);
    const before = db.prepare('SELECT * FROM resource_fields').all();
    const result = await client.callTool({ name: 'undo_commit', arguments: { undo_plan_id: plan.undo_plan_id } });
    expect(result.isError).toBe(true); expect(result.structuredContent).toMatchObject({ error: { code: 'STALE_PLAN' } });
    expect(db.prepare('SELECT * FROM resource_fields').all()).toEqual(before);
    expect(db.prepare('SELECT COUNT(*) AS n FROM undo_commits').get()).toEqual({ n: 0 });
  });
  it('rejects malformed patches, impersonation, duplicate fields and stale write revisions without extra history', async () => {
    const { client, db } = await setup();
    const args = patchArguments();
    for (const arguments_ of [
      { ...args, actor_kind: 'human' },
      { ...args, writes: [{ field: 'unknown', value: 'x', expected_revision: 0 }] },
      { ...args, writes: [args.writes[0], args.writes[0]] },
      { ...args, writes: [{ field: 'status', value: 'invalid-status', expected_revision: 0 }] },
      { ...args, writes: [{ field: 'note', value: 'x' }] },
      { ...args, writes: [{ ...args.writes[0], expected_revision: 10 }] },
    ]) {
      // Schema violations may be represented as protocol errors or tool errors by the SDK.
      let failed = false;
      try { failed = (await client.callTool({ name: 'asset_patch', arguments: arguments_ })).isError === true; }
      catch { failed = true; }
      expect(failed).toBe(true);
    }
    expect(db.prepare('SELECT COUNT(*) AS n FROM actions').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM effects').get()).toEqual({ n: 0 });
    await patch(client);
    const mismatch = await client.callTool({ name: 'asset_patch', arguments: { ...args, writes: [{ ...args.writes[0], value: 'Different' }] } });
    expect(mismatch.structuredContent).toMatchObject({ error: { code: 'IDEMPOTENCY_MISMATCH' } });
  });
  it('returns not-found errors and does not expose Human Action undo through MCP', async () => {
    const { client, engine } = await setup();
    for (const request of [
      { name: 'asset_get', arguments: { resource_id: 'missing' } },
      { name: 'undo_preview', arguments: { action_id: 'missing' } },
      { name: 'undo_commit', arguments: { undo_plan_id: 'missing' } },
    ]) {
      expect((await client.callTool(request)).structuredContent).toMatchObject({ error: { code: 'NOT_FOUND' } });
    }
    const human = engine.applyAction('human', 'user', 'h', [write(engine, 'asset_b', 'note', 'Human')]);
    expect((await client.callTool({ name: 'undo_preview', arguments: { action_id: human.id } })).structuredContent)
      .toMatchObject({ error: { code: 'AGENT_ACTION_REQUIRED' } });
    const humanPlan = engine.previewUndo(human.id);
    expect((await client.callTool({ name: 'undo_commit', arguments: { undo_plan_id: humanPlan.planId } })).structuredContent)
      .toMatchObject({ error: { code: 'AGENT_ACTION_REQUIRED' } });
  });
});
