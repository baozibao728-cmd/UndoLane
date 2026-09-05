import { UndoEngine } from '../packages/engine/index.ts';
import type { Field, Scalar } from '../packages/contracts/index.ts';
export function write(engine: UndoEngine, resourceId: string, field: Field, value: Scalar) {
  return { resourceId, field, expectedRevision: engine.getField(resourceId, field).revision, afterPresent: true, afterValue: value };
}
export function scenario(engine: UndoEngine) {
  for (const [index, id] of ['asset_a', 'asset_b', 'asset_c'].entries()) engine.createResource(id, {
    display_name: `Cake 0${index + 1}`, campaign: null, status: 'draft', note: '',
  });
  const agent = engine.applyAction('agent', 'agent', 'batch', [
    write(engine, 'asset_a', 'campaign', 'Autumn Launch'),
    write(engine, 'asset_b', 'campaign', 'Autumn Launch'),
    write(engine, 'asset_b', 'display_name', 'Autumn Cake 02'),
    write(engine, 'asset_c', 'campaign', 'Autumn Launch'),
  ]);
  const human = engine.applyAction('human', 'user', 'title', [write(engine, 'asset_b', 'display_name', 'Hero — Final')]);
  return { agent, human };
}
