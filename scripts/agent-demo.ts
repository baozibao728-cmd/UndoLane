import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import assert from 'node:assert/strict';
import { UndoEngine } from '../packages/engine/index.ts';
import { fields } from '../packages/contracts/index.ts';
import { connectUndoLane } from '../packages/agent/mcp.ts';
import { runAgent } from '../packages/agent/runner.ts';
import { OpenAICompatibleProvider, providerConfig, AgentError } from '../packages/agent/provider.ts';
import { outputs } from '../packages/mcp-server/schemas.ts';

// This script is the human/demo controller, outside the Agent Runner.
// Only fixture setup and Human edits use Engine directly. Agent writes and undo use MCP.
async function demo() {
  const { values } = parseArgs({ options: {
    db: { type: 'string', default: `phase3-demo-${Date.now()}.sqlite` },
    'human-value': { type: 'string' },
  } });
  const provider = new OpenAICompatibleProvider(providerConfig());
  if (existsSync(values.db)) throw new AgentError('DEMO_REQUIRES_NEW_DATABASE');
  const humanEngine = new UndoEngine(values.db);
  try {
    for (const [i, id] of ['asset_a', 'asset_b', 'asset_c'].entries()) humanEngine.createResource(id, {
      display_name: `Cake 0${i + 1}`, campaign: null, status: i < 2 ? 'approved' : 'unapproved', note: '',
    });
    const baseline = humanEngine.listAssets();
    const client = await connectUndoLane(values.db);
    try {
      console.log('LIVE MODEL demo with synthetic assets. Database:', values.db);
      const task = 'Prepare autumn campaign assets. Only assets with status exactly approved are eligible. '
        + 'Set their campaign to "Autumn Launch" and prefix each display_name with "Autumn ". '
        + 'Leave status, note and all unapproved assets unchanged.';
      console.log('Step 1 — Task:', task);
      const report = await runAgent(client, provider, task, e => console.log('MCP:', JSON.stringify(e)));
      console.log('Agent report:', JSON.stringify(report, null, 2));
      if (report.status !== 'completed') throw new AgentError(report.errorCode ?? 'AGENT_FAILED');
      // The model's final text is not an acceptance check: verify actual database state.
      for (const asset of baseline) for (const field of fields) {
        const current = humanEngine.getField(asset.resourceId, field);
        const expected = asset.fields.status.value === 'approved' && field === 'campaign' ? 'Autumn Launch'
          : asset.fields.status.value === 'approved' && field === 'display_name' ? `Autumn ${asset.fields.display_name.value}`
            : asset.fields[field].value;
        assert.equal(current.value, expected, `Agent task mismatch: ${asset.resourceId}.${field}`);
      }
      assert.equal(report.actions.flatMap(a => a.effects).length, 4, 'Expected four recorded Agent Effects');
      const history = report.actions.map(a => humanEngine.getEffects(a.action_id));
      let title = values['human-value'];
      if (title === undefined) {
        const terminal = createInterface({ input: stdin, output: stdout });
        try { title = await terminal.question('Step 4 — Human: new asset_b.display_name [Hero — Final]: ') || 'Hero — Final'; }
        finally { terminal.close(); }
      }
      const beforeHuman = humanEngine.getField('asset_b', 'display_name');
      const humanAction = humanEngine.applyAction('human', 'demo-user', 'human-title', [{
        resourceId: 'asset_b', field: 'display_name', expectedRevision: beforeHuman.revision,
        afterPresent: true, afterValue: title,
      }]);
      const protectedState = humanEngine.getField('asset_b', 'display_name');
      console.log('Human Action:', humanAction.id, 'Title:', title);
      let protectedCount = 0; let restoredCount = 0;
      // A patch is one Action per asset. Preview each Action just before its commit:
      // an earlier commit correctly invalidates any pre-created later plan.
      for (const action of [...report.actions].reverse()) {
        const preview = await client.callTool({ name: 'undo_preview', arguments: { action_id: action.action_id } });
        assert.ok(!preview.isError);
        const plan = outputs.undo_preview.parse(preview.structuredContent);
        console.log('Step 5 — Undo Preview:', JSON.stringify(plan, null, 2));
        for (const item of plan.items.filter(i => i.decision === 'protected')) {
          assert.equal(item.reason, 'A newer human edit owns this field'); protectedCount++;
        }
        const committed = await client.callTool({ name: 'undo_commit', arguments: { undo_plan_id: plan.undo_plan_id } });
        assert.ok(!committed.isError);
        const receipt = outputs.undo_commit.parse(committed.structuredContent);
        restoredCount += receipt.restored.length;
        console.log('Step 6 — Undo Receipt:', JSON.stringify(receipt, null, 2));
      }
      assert.equal(protectedCount, 1); assert.equal(restoredCount, 3);
      assert.deepEqual(humanEngine.getField('asset_b', 'display_name'), protectedState);
      for (const asset of baseline) for (const field of fields) {
        if (asset.resourceId === 'asset_b' && field === 'display_name') continue;
        const current = humanEngine.getField(asset.resourceId, field);
        assert.equal(current.value, asset.fields[field].value);
        assert.equal(current.present, asset.fields[field].present);
      }
      assert.deepEqual(report.actions.map(a => humanEngine.getEffects(a.action_id)), history);
      console.log('VERIFIED:', JSON.stringify({ mode: 'live', restored: restoredCount, protected: protectedCount,
        humanTitle: title, database: values.db, assets: humanEngine.listAssets() }, null, 2));
    } finally { await client.close(); }
  } finally { humanEngine.close(); }
}
demo().catch(error => { console.error(error instanceof AgentError ? error.code : 'DEMO_VERIFICATION_FAILED'); process.exitCode = 1; });
