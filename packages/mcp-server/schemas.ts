import * as z from 'zod/v4';
import { fields } from '../contracts/index.ts';

const id = z.string().min(1).max(200);
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const value = z.string().nullable();
const field = z.enum(fields);
const fieldMap = <T extends z.ZodType>(schema: T) => z.object({
  display_name: schema, campaign: schema, status: schema, note: schema,
});
export const inputs = {
  assets_list: z.strictObject({}),
  asset_get: z.strictObject({ resource_id: id.describe('Asset ID returned by assets_list, e.g. asset_a') }),
  asset_patch: z.strictObject({
    resource_id: id,
    operation_key: id.describe('Stable unique key for this request. Reuse the same key and identical arguments on retry.'),
    writes: z.array(z.strictObject({
      field,
      value: z.string().max(100_000).nullable(),
      present: z.boolean().default(true).describe('False removes the field and requires value=null.'),
      expected_revision: revision.describe('Exact field revision from asset_get or assets_list. Never guess.'),
    })).min(1).max(4).describe('Independent fields within one atomic Agent Action. Duplicate fields are rejected.'),
  }),
  undo_preview: z.strictObject({ action_id: id.describe('Agent Action ID returned by asset_patch') }),
  undo_commit: z.strictObject({ undo_plan_id: id.describe('Exact saved plan ID returned by undo_preview; commits all Eligible fields.') }),
};
export const effectSchema = z.object({
  effect_id: id, action_id: id, resource_id: id, field,
  before_present: z.boolean(), before_value: value, before_revision: revision,
  after_present: z.boolean(), after_value: value, after_revision: revision,
  previous_effect_id: id.nullable(),
});
const mutation = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('effect'), mutation_id: id, action_id: id,
    actor_kind: z.enum(['human', 'agent']), actor_id: id, effect: effectSchema }),
  z.object({ kind: z.literal('compensation'), mutation_id: id, undo_commit_id: id,
    effect_id: id, before_revision: revision, after_revision: revision }),
]);
const summary = z.object({ resource_id: id, display_name: value, campaign: value, status: value,
  revision: fieldMap(revision), present: fieldMap(z.boolean()) });
export const outputs = {
  assets_list: z.object({ resources: z.array(summary) }),
  asset_get: summary.extend({ note: value, active_effect_id: fieldMap(id.nullable()),
    last_mutation_id: fieldMap(id.nullable()), recent_modifications: fieldMap(mutation.nullable()) }),
  asset_patch: z.object({ action_id: id, actor_kind: z.literal('agent'), actor_id: id,
    effects: z.array(effectSchema) }),
  undo_preview: z.object({
    undo_plan_id: id, action_id: id, plan_hash: z.string(), base_workspace_revision: revision,
    expires_at: revision, eligible: revision, protected: revision, blocked: revision,
    already_undone: revision, unsupported: revision,
    items: z.array(z.object({ effect_id: id, resource_id: id, field,
      decision: z.enum(['eligible', 'protected', 'blocked', 'already_undone', 'unsupported']),
      can_undo: z.boolean(), reason: z.string(), current_value: value, current_present: z.boolean(),
      revision, active_effect_id: id.nullable(), restore_value: value, restore_present: z.boolean(),
      previous_effect_id: id.nullable(),
    })),
  }),
  undo_commit: z.object({ undo_commit_id: id, undo_plan_id: id, action_id: id,
    restored: z.array(id), preserved: z.array(id), workspace_revision: revision,
    status: z.enum(['undone', 'partially_undone', 'unchanged']) }),
};
