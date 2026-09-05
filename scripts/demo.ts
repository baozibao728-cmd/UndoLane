import { UndoEngine } from '../packages/engine/index.ts';
import { scenario } from './scenario.ts';
const engine = new UndoEngine();
try {
  const { agent } = scenario(engine);
  const plan = engine.previewUndo(agent.id);
  console.table(plan.items.map(i => ({ resource: i.resourceId, field: i.field, decision: i.decision, reason: i.reason })));
  console.log(engine.commitUndo(plan));
  console.table(['asset_a', 'asset_b', 'asset_c'].map(id => ({ id,
    campaign: engine.getField(id, 'campaign').value,
    display_name: engine.getField(id, 'display_name').value,
    campaignRevision: engine.getField(id, 'campaign').revision,
  })));
} finally { engine.close(); }
