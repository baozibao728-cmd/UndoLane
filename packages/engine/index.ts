import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { fields, UndoLaneError, type Action, type AssetSnapshot, type Effect, type Field, type FieldMutation, type FieldState, type FieldWrite, type Scalar, type UndoItem, type UndoPlan, type UndoReceipt } from '../contracts/index.ts';

const fail = (code: string): never => { throw new UndoLaneError(code); };
const json = (value: unknown) => JSON.stringify(value);
// All hashed data is constructed by the engine in a fixed property order.
const hash = (value: unknown) => createHash('sha256').update(json(value)).digest('hex');
type Row = Record<string, any>;

export class UndoEngine {
  private db: Database.Database;
  constructor(path = ':memory:') {
    this.db = new Database(path);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    const version = this.db.pragma('user_version', { simple: true });
    if (version === 0) this.db.transaction(() => {
      this.db.exec(readFileSync(new URL('./migrations/001-core.sql', import.meta.url), 'utf8'));
    }).immediate();
    else if (version !== 1) fail('UNSUPPORTED_SCHEMA');
    for (const table of ['actions', 'effects', 'compensations', 'undo_commits', 'undo_plans']) {
      for (const operation of ['UPDATE', 'DELETE']) this.db.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${operation}
        BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT, 'APPEND_ONLY'); END`);
    }
  }
  close() { this.db.close(); }
  private one(sql: string, ...params: any[]): Row | undefined { return this.db.prepare(sql).get(...params) as Row | undefined; }
  private all(sql: string, ...params: any[]): Row[] { return this.db.prepare(sql).all(...params) as Row[]; }
  get workspaceRevision(): number { return this.one("SELECT revision FROM workspaces WHERE id='local'")!.revision; }
  private bump() { this.db.prepare("UPDATE workspaces SET revision=revision+1 WHERE id='local'").run(); }
  private validate(field: Field, present: boolean, value: Scalar) {
    if (!fields.includes(field) || typeof present !== 'boolean' ||
      (value !== null && typeof value !== 'string') || (!present && value !== null) ||
      (field === 'status' && value !== null && !['draft', 'approved', 'unapproved'].includes(value as string))) fail('INVALID_PATCH');
  }
  createResource(id: string, initial: Partial<Record<Field, Scalar>> = {}) {
    this.db.transaction(() => {
      if (Object.keys(initial).some(key => !fields.includes(key as Field))) fail('INVALID_PATCH');
      this.db.prepare("INSERT INTO resources(id,workspace_id) VALUES (?, 'local')").run(id);
      for (const field of fields) {
        const present = Object.hasOwn(initial, field); const value = initial[field] ?? null;
        this.validate(field, present, value);
        this.db.prepare("INSERT INTO resource_fields VALUES ('local',?,?,?,?,0,NULL,NULL)").run(id, field, +present, json(value));
      }
      this.bump();
    }).immediate();
  }
  getField(resourceId: string, field: Field): FieldState {
    const row = this.one("SELECT * FROM resource_fields WHERE workspace_id='local' AND resource_id=? AND field=?", resourceId, field) ?? fail('NOT_FOUND');
    return { resourceId, field, present: !!row.present, value: JSON.parse(row.value_json), revision: row.revision, activeEffectId: row.active_effect_id, lastMutationId: row.last_mutation_id };
  }
  getEffects(actionId: string): Effect[] {
    return this.all('SELECT * FROM effects WHERE action_id=? ORDER BY rowid', actionId).map(r => ({
      id: r.id, actionId: r.action_id, resourceId: r.resource_id, field: r.field,
      beforePresent: !!r.before_present, beforeValue: JSON.parse(r.before_json), beforeRevision: r.before_revision,
      previousEffectId: r.previous_effect_id, afterPresent: !!r.after_present, afterValue: JSON.parse(r.after_json), afterRevision: r.after_revision,
    }));
  }
  getAction(id: string): Action {
    const r = this.one("SELECT * FROM actions WHERE workspace_id='local' AND id=?", id) ?? fail('NOT_FOUND');
    return { id: r.id, actorKind: r.actor_kind, actorId: r.actor_id, operationKey: r.operation_key };
  }
  // Read snapshots use a SQLite read transaction so values and ownership are coherent.
  getAsset(resourceId: string): AssetSnapshot {
    return this.db.transaction(() => {
      const states = {} as Record<Field, FieldState>;
      const recentMutations = {} as Record<Field, FieldMutation | null>;
      for (const field of fields) {
        const state = this.getField(resourceId, field);
        states[field] = state;
        recentMutations[field] = null;
        if (!state.lastMutationId) continue;
        const forward = this.one('SELECT action_id FROM effects WHERE id=? AND resource_id=? AND field=?', state.lastMutationId, resourceId, field);
        if (forward) {
          const action = this.getAction(forward.action_id);
          const effect = this.getEffects(action.id).find(e => e.id === state.lastMutationId)!;
          recentMutations[field] = { kind: 'effect', id: effect.id, action, effect };
        } else {
          const c = this.one('SELECT c.* FROM compensations c JOIN effects e ON e.id=c.effect_id WHERE c.id=? AND e.resource_id=? AND e.field=?', state.lastMutationId, resourceId, field) ?? fail('INCONSISTENT_STATE');
          recentMutations[field] = { kind: 'compensation', id: c.id, undoCommitId: c.undo_commit_id,
            effectId: c.effect_id, beforeRevision: c.before_revision, afterRevision: c.after_revision };
        }
      }
      return { resourceId, fields: states, recentMutations };
    })();
  }
  listAssets(): AssetSnapshot[] {
    return this.db.transaction(() => this.all("SELECT id FROM resources WHERE workspace_id='local' ORDER BY id")
      .map(r => this.getAsset(r.id)))();
  }
  getUndoPlan(planId: string): UndoPlan {
    const row = this.one("SELECT * FROM undo_plans WHERE workspace_id='local' AND id=?", planId) ?? fail('NOT_FOUND');
    return { planId: row.id, targetActionId: row.target_action_id, planHash: row.plan_hash,
      baseWorkspaceRevision: row.base_revision, expiresAt: row.expires_at, items: JSON.parse(row.items_json) };
  }
  applyAction(actorKind: Action['actorKind'], actorId: string, operationKey: string, writes: FieldWrite[]): Action {
    if (!['human', 'agent'].includes(actorKind) || !actorId || !operationKey || !writes.length) fail('INVALID_PATCH');
    const keys = writes.map(w => json([w.resourceId, w.field]));
    if (new Set(keys).size !== keys.length) fail('INVALID_PATCH');
    writes.forEach(w => { this.validate(w.field, w.afterPresent, w.afterValue); if (!Number.isSafeInteger(w.expectedRevision) || w.expectedRevision < 0) fail('INVALID_PATCH'); });
    const request = json({ actorKind, writes });
    return this.db.transaction(() => {
      const existing = this.one("SELECT * FROM actions WHERE workspace_id='local' AND actor_id=? AND operation_key=?", actorId, operationKey);
      if (existing) { if (existing.request_json !== request) fail('IDEMPOTENCY_MISMATCH'); return this.getAction(existing.id); }
      const id = randomUUID();
      this.db.prepare("INSERT INTO actions(id,workspace_id,actor_kind,actor_id,operation_key,request_json) VALUES (?,'local',?,?,?,?)").run(id, actorKind, actorId, operationKey, request);
      for (const w of writes) {
        const before = this.getField(w.resourceId, w.field);
        if (before.revision !== w.expectedRevision) fail('REVISION_CONFLICT');
        const effectId = randomUUID();
        this.db.prepare('INSERT INTO effects VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(effectId, id, w.resourceId, w.field, +before.present, json(before.value), before.revision, before.activeEffectId, +w.afterPresent, json(w.afterValue), before.revision + 1);
        this.db.prepare("UPDATE resource_fields SET present=?, value_json=?, revision=revision+1, active_effect_id=?,last_mutation_id=? WHERE workspace_id='local' AND resource_id=? AND field=?").run(+w.afterPresent, json(w.afterValue), effectId, effectId, w.resourceId, w.field);
      }
      this.bump(); return this.getAction(id);
    }).immediate();
  }
  private inspect(actionId: string): UndoItem[] {
    return this.getEffects(actionId).map(e => {
      const current = this.getField(e.resourceId, e.field);
      let decision: UndoItem['decision'] = 'eligible'; let reason = 'The target effect owns this field';
      if (this.one('SELECT id FROM compensations WHERE effect_id=?', e.id)) { decision = 'already_undone'; reason = 'This effect already has a compensation record'; }
      else if (current.activeEffectId !== e.id) {
        decision = 'protected';
        const owner = this.one('SELECT a.actor_kind FROM effects e JOIN actions a ON a.id=e.action_id WHERE e.id=?', current.activeEffectId);
        reason = owner?.actor_kind === 'human' ? 'A newer human edit owns this field' : 'A newer operation owns this field';
      } else if (current.present !== e.afterPresent || json(current.value) !== json(e.afterValue) || current.revision < e.afterRevision) {
        decision = 'unsupported'; reason = 'Field state is inconsistent with its owning effect';
      }
      return { effectId: e.id, resourceId: e.resourceId, field: e.field, decision, reason, current,
        restorePresent: e.beforePresent, restoreValue: e.beforeValue, previousEffectId: e.previousEffectId };
    });
  }
  previewUndo(actionId: string): UndoPlan {
    return this.db.transaction(() => {
      this.getAction(actionId);
      const payload = { planId: randomUUID(), targetActionId: actionId, baseWorkspaceRevision: this.workspaceRevision, expiresAt: Date.now() + 15 * 60_000, items: this.inspect(actionId) };
      const plan = { ...payload, planHash: hash(payload) };
      this.db.prepare("INSERT INTO undo_plans VALUES (?,'local',?,?,?,?,?)").run(plan.planId, actionId, plan.baseWorkspaceRevision, plan.planHash, json(plan.items), plan.expiresAt);
      return plan;
    }).immediate();
  }
  commitUndo(plan: Pick<UndoPlan, 'planId' | 'planHash'>, options: { selectedEffectIds?: string[]; operationKey?: string } = {}): UndoReceipt {
    return this.db.transaction(() => {
      const stored = this.one("SELECT * FROM undo_plans WHERE workspace_id='local' AND id=?", plan.planId) ?? fail('NOT_FOUND');
      if (stored.plan_hash !== plan.planHash) fail('PLAN_MISMATCH');
      const items: UndoItem[] = JSON.parse(stored.items_json);
      const selected = [...(options.selectedEffectIds ?? items.filter(i => i.decision === 'eligible').map(i => i.effectId))].sort();
      if (new Set(selected).size !== selected.length || selected.some(id => !items.some(i => i.effectId === id && i.decision === 'eligible'))) fail('INVALID_SELECTION');
      const key = options.operationKey ?? plan.planId;
      const prior = this.one('SELECT * FROM undo_commits WHERE plan_id=? OR operation_key=?', plan.planId, key);
      if (prior) {
        if (prior.plan_id !== plan.planId || prior.selected_effect_ids_json !== json(selected)) fail('IDEMPOTENCY_MISMATCH');
        return JSON.parse(prior.receipt_json) as UndoReceipt;
      }
      if (stored.expires_at <= Date.now() || stored.base_revision !== this.workspaceRevision || json(this.inspect(stored.target_action_id)) !== stored.items_json) fail('STALE_PLAN');
      const id = randomUUID();
      const already = items.filter(i => i.decision === 'already_undone').length;
      const receipt: UndoReceipt = { id, planId: plan.planId, targetActionId: stored.target_action_id, restored: selected,
        preserved: items.filter(i => !selected.includes(i.effectId) && i.decision !== 'already_undone').map(i => i.effectId),
        workspaceRevision: this.workspaceRevision + (selected.length ? 1 : 0),
        status: already + selected.length === items.length ? 'undone' : already + selected.length > 0 ? 'partially_undone' : 'unchanged' };
      this.db.prepare("INSERT INTO undo_commits(id,workspace_id,plan_id,operation_key,selected_effect_ids_json,receipt_json) VALUES (?,'local',?,?,?,?)").run(id, plan.planId, key, json(selected), json(receipt));
      for (const item of items.filter(i => selected.includes(i.effectId))) {
        const compensationId = randomUUID();
        const result = this.db.prepare("UPDATE resource_fields SET present=?,value_json=?,revision=revision+1,active_effect_id=?,last_mutation_id=? WHERE workspace_id='local' AND resource_id=? AND field=? AND revision=? AND active_effect_id=? AND present=? AND value_json=?")
          .run(+item.restorePresent, json(item.restoreValue), item.previousEffectId, compensationId, item.resourceId, item.field, item.current.revision, item.effectId, +item.current.present, json(item.current.value));
        if (result.changes !== 1) fail('STALE_PLAN');
        this.db.prepare('INSERT INTO compensations VALUES (?,?,?,?,?)').run(compensationId, id, item.effectId, item.current.revision, item.current.revision + 1);
      }
      if (selected.length) this.bump();
      return receipt;
    }).immediate();
  }
}
