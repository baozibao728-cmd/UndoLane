import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UndoEngine } from '../packages/engine/index.ts';
import { scenario, write } from '../scripts/scenario.ts';

const cleanup: (() => void)[] = [];
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'undolane-'));
  const path = join(dir, 'test.sqlite');
  const engine = new UndoEngine(path); const db = new Database(path);
  cleanup.push(() => { db.close(); engine.close(); rmSync(dir, { recursive: true, force: true }); });
  return { engine, db, path };
}
afterEach(() => { vi.restoreAllMocks(); cleanup.splice(0).reverse().forEach(fn => fn()); });
describe('conditional undo against real SQLite', () => {
  it('rejects expired plans', () => {
    const { engine: e } = setup(); const { agent } = scenario(e); const plan = e.previewUndo(agent.id);
    vi.spyOn(Date, 'now').mockReturnValue(plan.expiresAt);
    expect(() => e.commitUndo(plan)).toThrow('STALE_PLAN');
    expect(e.getField('asset_a', 'campaign').revision).toBe(1);
  });
  it('supports an explicit eligible subset and rejects mismatched idempotency keys', () => {
    const { engine: e } = setup(); const { agent } = scenario(e); const plan = e.previewUndo(agent.id);
    const options = { selectedEffectIds: [plan.items[0].effectId], operationKey: 'undo-key' };
    const receipt = e.commitUndo(plan, options);
    expect(receipt.restored).toHaveLength(1); expect(receipt.status).toBe('partially_undone');
    expect(e.getField('asset_b', 'campaign').value).toBe('Autumn Launch');
    expect(e.commitUndo(plan, options)).toEqual(receipt);
    expect(() => e.commitUndo(plan)).toThrow('IDEMPOTENCY_MISMATCH');
    expect(() => e.commitUndo(e.previewUndo(agent.id), { operationKey: 'undo-key' })).toThrow('IDEMPOTENCY_MISMATCH');
  });
  it('forward retries are durable and reject different requests for the same key', () => {
    const { engine: e } = setup(); e.createResource('a');
    const writes = [write(e, 'a', 'note', 'one')];
    const action = e.applyAction('agent', 'agent', 'key', writes);
    expect(e.applyAction('agent', 'agent', 'key', writes)).toEqual(action);
    expect(e.getField('a', 'note').revision).toBe(1);
    expect(() => e.applyAction('agent', 'agent', 'key', [write(e, 'a', 'note', 'two')])).toThrow('IDEMPOTENCY_MISMATCH');
  });
  it('restores agent campaigns, protects human title, preserves unrelated note and history', () => {
    const { engine: e, db } = setup(); const { agent, human } = scenario(e);
    e.applyAction('human', 'user', 'note', [write(e, 'asset_a', 'note', 'Use this as the cover.')]);
    const history = e.getEffects(agent.id); const plan = e.previewUndo(agent.id);
    expect(plan.items.map(i => i.decision)).toEqual(['eligible', 'eligible', 'protected', 'eligible']);
    expect(plan.items[2].reason).toBe('A newer human edit owns this field');
    const title = e.getField('asset_b', 'display_name'); const revision = e.workspaceRevision;
    expect(e.commitUndo(plan).status).toBe('partially_undone');
    for (const id of ['asset_a', 'asset_b', 'asset_c']) {
      expect(e.getField(id, 'campaign')).toMatchObject({ value: null, present: true, revision: 2, activeEffectId: null });
    }
    expect(e.workspaceRevision).toBe(revision + 1);
    expect(e.getField('asset_b', 'display_name')).toEqual(title);
    expect(title.value).toBe('Hero — Final');
    expect(e.getField('asset_a', 'note').value).toBe('Use this as the cover.');
    expect(e.getEffects(agent.id)).toEqual(history); expect(e.getAction(human.id).actorKind).toBe('human');
    expect(db.prepare('SELECT COUNT(*) AS n FROM compensations').get()).toEqual({ n: 3 });
    expect(() => db.prepare('DELETE FROM effects').run()).toThrow('APPEND_ONLY');
  });
  it('same plan retries return the same receipt even after later edits and from another connection', () => {
    const { engine: e, path, db } = setup(); const { agent } = scenario(e);
    const plan = e.previewUndo(agent.id); const receipt = e.commitUndo(plan);
    e.applyAction('human', 'user', 'later', [write(e, 'asset_a', 'campaign', 'Winter')]);
    const revision = e.workspaceRevision;
    const reopened = new UndoEngine(path);
    try { expect(reopened.commitUndo(plan, { operationKey: 'retry-new-key' })).toEqual(receipt); }
    finally { reopened.close(); }
    expect(e.workspaceRevision).toBe(revision);
    expect(e.getField('asset_a', 'campaign').value).toBe('Winter');
    expect(db.prepare('SELECT COUNT(*) AS n FROM undo_commits').get()).toEqual({ n: 1 });
    expect(e.previewUndo(agent.id).items.map(i => i.decision)).toEqual(['already_undone', 'already_undone', 'protected', 'already_undone']);
  });
  it('rejects stale previews after an unrelated write from another connection with zero undo writes', () => {
    const { engine: e, path, db } = setup(); const { agent } = scenario(e); const plan = e.previewUndo(agent.id);
    const other = new UndoEngine(path);
    try { other.applyAction('human', 'user', 'later', [write(other, 'asset_c', 'note', 'later')]); }
    finally { other.close(); }
    const before = db.prepare('SELECT * FROM resource_fields').all();
    expect(() => e.commitUndo(plan)).toThrow('STALE_PLAN');
    expect(db.prepare('SELECT * FROM resource_fields').all()).toEqual(before);
    expect(db.prepare('SELECT COUNT(*) AS n FROM undo_commits').get()).toEqual({ n: 0 });
  });
  it('protects ABA and explicit same-value human writes', () => {
    const { engine: e } = setup(); const { agent } = scenario(e);
    e.applyAction('human', 'user', 'away', [write(e, 'asset_a', 'campaign', 'Winter')]);
    e.applyAction('human', 'user', 'back', [write(e, 'asset_a', 'campaign', 'Autumn Launch')]);
    e.applyAction('human', 'user', 'same', [write(e, 'asset_c', 'campaign', 'Autumn Launch')]);
    const plan = e.previewUndo(agent.id);
    expect(plan.items.map(i => i.decision)).toEqual(['protected', 'eligible', 'protected', 'protected']);
    e.commitUndo(plan); expect(e.getField('asset_a', 'campaign').value).toBe('Autumn Launch');
    expect(e.getField('asset_c', 'campaign').value).toBe('Autumn Launch');
  });
  it('restores previous logical ownership without rewinding physical revisions', () => {
    const { engine: e } = setup(); e.createResource('a', { campaign: '' });
    const first = e.applyAction('agent', 'agent', 'one', [write(e, 'a', 'campaign', 'One')]);
    const second = e.applyAction('agent', 'agent', 'two', [write(e, 'a', 'campaign', 'Two')]);
    e.commitUndo(e.previewUndo(second.id));
    expect(e.getField('a', 'campaign')).toMatchObject({ value: 'One', revision: 3, activeEffectId: e.getEffects(first.id)[0].id });
    expect(e.previewUndo(first.id).items[0].decision).toBe('eligible');
    e.commitUndo(e.previewUndo(first.id)); expect(e.getField('a', 'campaign')).toMatchObject({ value: '', revision: 4 });
  });
  it('distinguishes missing, null and empty values', () => {
    const { engine: e } = setup(); e.createResource('a', { campaign: null, note: '' });
    const action = e.applyAction('agent', 'agent', 'one', ['campaign', 'note', 'display_name'].map(field => write(e, 'a', field as 'campaign' | 'note' | 'display_name', 'X')));
    e.commitUndo(e.previewUndo(action.id));
    expect(e.getField('a', 'campaign')).toMatchObject({ present: true, value: null });
    expect(e.getField('a', 'note')).toMatchObject({ present: true, value: '' });
    expect(e.getField('a', 'display_name')).toMatchObject({ present: false, value: null });
  });
  it('rolls back fields, revision, receipt and compensation if a later compensation insert fails', () => {
    const { engine: e, db } = setup(); const { agent } = scenario(e); const plan = e.previewUndo(agent.id);
    const before = db.prepare('SELECT * FROM resource_fields').all(); const revision = e.workspaceRevision;
    db.exec(`CREATE TRIGGER fail_second BEFORE INSERT ON compensations WHEN (SELECT COUNT(*) FROM compensations)=1 BEGIN SELECT RAISE(ABORT,'INJECTED_FAILURE'); END`);
    expect(() => e.commitUndo(plan)).toThrow('INJECTED_FAILURE');
    expect(db.prepare('SELECT * FROM resource_fields').all()).toEqual(before); expect(e.workspaceRevision).toBe(revision);
    expect(db.prepare('SELECT COUNT(*) AS n FROM undo_commits').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM compensations').get()).toEqual({ n: 0 });
    db.exec('DROP TRIGGER fail_second'); expect(e.commitUndo(plan).restored).toHaveLength(3);
  });
  it('uses stored inverse values and rejects invalid hashes or protected selections', () => {
    const { engine: e } = setup(); const { agent } = scenario(e); const plan = e.previewUndo(agent.id);
    expect(() => e.commitUndo({ ...plan, planHash: 'fake' })).toThrow('PLAN_MISMATCH');
    expect(() => e.commitUndo(plan, { selectedEffectIds: [plan.items[2].effectId] })).toThrow('INVALID_SELECTION');
    plan.items[0].restoreValue = 'tampered'; e.commitUndo(plan);
    expect(e.getField('asset_a', 'campaign').value).toBe(null);
  });
  it('rejects duplicate fields and rolls back forward actions on revision conflict', () => {
    const { engine: e, db } = setup(); e.createResource('a');
    const patch = write(e, 'a', 'note', 'X');
    expect(() => e.applyAction('agent', 'agent', 'dup', [patch, patch])).toThrow('INVALID_PATCH');
    expect(() => e.applyAction('agent', 'agent', 'bad', [patch, { ...write(e, 'a', 'campaign', 'X'), expectedRevision: 9 }])).toThrow('REVISION_CONFLICT');
    expect(e.getField('a', 'note').revision).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM actions').get()).toEqual({ n: 0 });
  });
  it('detects direct database state changes even without a workspace revision bump', () => {
    const { engine: e, db } = setup(); const { agent } = scenario(e); const plan = e.previewUndo(agent.id);
    db.prepare("UPDATE resource_fields SET value_json='\"corrupt\"' WHERE resource_id='asset_a' AND field='campaign'").run();
    expect(() => e.commitUndo(plan)).toThrow('STALE_PLAN');
    expect(e.previewUndo(agent.id).items[0].decision).toBe('unsupported');
  });
});
