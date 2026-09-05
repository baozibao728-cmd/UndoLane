import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { UndoEngine } from '../engine/index.ts';
import { fields, UndoLaneError, type AssetSnapshot, type Effect, type Field, type FieldMutation } from '../contracts/index.ts';
import { inputs, outputs } from './schemas.ts';

const actorId = 'mcp-agent'; // Local server attribution, never accepted from tool arguments.
function mapFields<T>(fn: (field: Field) => T): Record<Field, T> {
  return Object.fromEntries(fields.map(field => [field, fn(field)])) as Record<Field, T>;
}
function effect(e: Effect) {
  return { effect_id: e.id, action_id: e.actionId, resource_id: e.resourceId, field: e.field,
    before_present: e.beforePresent, before_value: e.beforeValue, before_revision: e.beforeRevision,
    after_present: e.afterPresent, after_value: e.afterValue, after_revision: e.afterRevision,
    previous_effect_id: e.previousEffectId };
}
function mutation(m: FieldMutation | null) {
  if (!m) return null;
  return m.kind === 'effect'
    ? { kind: m.kind, mutation_id: m.id, action_id: m.action.id, actor_kind: m.action.actorKind,
      actor_id: m.action.actorId, effect: effect(m.effect) }
    : { kind: m.kind, mutation_id: m.id, undo_commit_id: m.undoCommitId, effect_id: m.effectId,
      before_revision: m.beforeRevision, after_revision: m.afterRevision };
}
function summary(asset: AssetSnapshot) {
  return { resource_id: asset.resourceId, display_name: asset.fields.display_name.value,
    campaign: asset.fields.campaign.value, status: asset.fields.status.value,
    revision: mapFields(f => asset.fields[f].revision), present: mapFields(f => asset.fields[f].present) };
}
const hints: Record<string, string> = {
  NOT_FOUND: 'Check the ID using assets_list or undo_preview.',
  INVALID_PATCH: 'Use distinct supported fields; status must be draft, approved, unapproved or null. Missing fields require value=null.',
  REVISION_CONFLICT: 'Read asset_get again and review the current field before submitting a new operation.',
  STALE_PLAN: 'Nothing was undone. Call undo_preview again and review the new plan.',
  IDEMPOTENCY_MISMATCH: 'Reuse a key only with its original arguments. Use a new key for a new operation.',
  AGENT_ACTION_REQUIRED: 'Only Agent Actions can be undone through these MCP tools.',
};
function execute(operation: () => Record<string, unknown>): CallToolResult {
  try {
    const result = operation();
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  } catch (error) {
    const code = error instanceof UndoLaneError ? error.code : 'INTERNAL_ERROR';
    const result = { error: { code, message: hints[code] ?? 'The operation failed. Inspect the local engine state before retrying.' } };
    return { isError: true, content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  }
}
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

export function createMcpServer(engine: UndoEngine): McpServer {
  const server = new McpServer({ name: 'undolane-mcp-server', version: '0.2.0' });
  function requireAgent(actionId: string) {
    if (engine.getAction(actionId).actorKind !== 'agent') throw new UndoLaneError('AGENT_ACTION_REQUIRED');
  }
  server.registerTool('assets_list', {
    title: 'List assets', description: 'List all local managed assets, current values and per-field revision maps. No arguments.',
    inputSchema: inputs.assets_list, outputSchema: outputs.assets_list, annotations: read,
  }, () => execute(() => ({ resources: engine.listAssets().map(summary) })));
  server.registerTool('asset_get', {
    title: 'Get asset', description: 'Read an asset snapshot including values, per-field revisions, active forward ownership and the latest physical mutation for each field (Effect or compensation).',
    inputSchema: inputs.asset_get, outputSchema: outputs.asset_get, annotations: read,
  }, ({ resource_id }) => execute(() => {
    const asset = engine.getAsset(resource_id);
    return { ...summary(asset), note: asset.fields.note.value,
      active_effect_id: mapFields(f => asset.fields[f].activeEffectId),
      last_mutation_id: mapFields(f => asset.fields[f].lastMutationId),
      recent_modifications: mapFields(f => mutation(asset.recentMutations[f])) };
  }));
  server.registerTool('asset_patch', {
    title: 'Patch asset', description: 'Apply one atomic Agent Action through Undo Engine. Read field revisions first. Returns immutable recorded Effects, not a fresh snapshot; retry identical arguments with the same operation_key.',
    inputSchema: inputs.asset_patch, outputSchema: outputs.asset_patch, annotations: write,
  }, ({ resource_id, operation_key, writes }) => execute(() => {
    const action = engine.applyAction('agent', actorId, operation_key, writes.map(w => ({
      resourceId: resource_id, field: w.field, expectedRevision: w.expected_revision,
      afterPresent: w.present, afterValue: w.value,
    })));
    return { action_id: action.id, actor_kind: action.actorKind, actor_id: action.actorId,
      effects: engine.getEffects(action.id).map(effect) };
  }));
  server.registerTool('undo_preview', {
    title: 'Preview conditional undo', description: 'Persist an exact undo plan for an Agent Action. Review each decision and reason before undo_commit. Does not change asset fields. blocked is always zero in this phase; dependency analysis is not implemented.',
    inputSchema: inputs.undo_preview, outputSchema: outputs.undo_preview,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, ({ action_id }) => execute(() => {
    requireAgent(action_id);
    const plan = engine.previewUndo(action_id);
    const count = (decision: string) => plan.items.filter(i => i.decision === decision).length;
    return { undo_plan_id: plan.planId, action_id, plan_hash: plan.planHash,
      base_workspace_revision: plan.baseWorkspaceRevision, expires_at: plan.expiresAt,
      eligible: count('eligible'), protected: count('protected'), blocked: count('blocked'),
      already_undone: count('already_undone'), unsupported: count('unsupported'),
      items: plan.items.map(i => ({ effect_id: i.effectId, resource_id: i.resourceId, field: i.field,
        decision: i.decision, can_undo: i.decision === 'eligible', reason: i.reason,
        current_value: i.current.value, current_present: i.current.present, revision: i.current.revision,
        active_effect_id: i.current.activeEffectId, restore_value: i.restoreValue,
        restore_present: i.restorePresent, previous_effect_id: i.previousEffectId })) };
  }));
  server.registerTool('undo_commit', {
    title: 'Commit conditional undo', description: 'Commit all Eligible fields of the exact saved plan reviewed through undo_preview. Preserves Protected fields. A stale plan fails with no undo writes. Retrying the same plan ID returns the original receipt.',
    inputSchema: inputs.undo_commit, outputSchema: outputs.undo_commit, annotations: write,
  }, ({ undo_plan_id }) => execute(() => {
    const plan = engine.getUndoPlan(undo_plan_id);
    requireAgent(plan.targetActionId);
    const receipt = engine.commitUndo(plan);
    return { undo_commit_id: receipt.id, undo_plan_id: receipt.planId, action_id: receipt.targetActionId,
      restored: receipt.restored, preserved: receipt.preserved, workspace_revision: receipt.workspaceRevision,
      status: receipt.status };
  }));
  return server;
}
