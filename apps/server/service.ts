import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { UndoEngine } from '../../packages/engine/index.ts';
import { connectUndoLane } from '../../packages/agent/mcp.ts';
import { runAgent } from '../../packages/agent/runner.ts';
import { AgentError, OpenAICompatibleProvider, providerConfig } from '../../packages/agent/provider.ts';
import { outputs, inputs } from '../../packages/mcp-server/schemas.ts';
import { FixtureProvider } from './fixture-provider.ts';
import { demoTask, type Mode, type Receipt, type WebRun, type Workspace, type ActionView } from '../shared/types.ts';

export async function createDemoService(directory: string) {
  mkdirSync(directory, { recursive: true });
  const engine = new UndoEngine(join(directory, 'workspace.sqlite'));
  if (!engine.listAssets().length) for (const [i, id] of ['asset_a', 'asset_b', 'asset_c'].entries()) {
    engine.createResource(id, { display_name: `Cake 0${i + 1}`, campaign: null,
      status: i < 2 ? 'approved' : 'unapproved', note: '' });
  }
  const indexPath = join(directory, 'web-history.json');
  // Presentation metadata only. Business state, ownership, plans and receipts stay in SQLite.
  const index: { runs: WebRun[]; receipts: Record<string, Receipt> } = existsSync(indexPath)
    ? JSON.parse(readFileSync(indexPath, 'utf8')) : { runs: [], receipts: {} };
  const save = () => { writeFileSync(`${indexPath}.tmp`, JSON.stringify(index)); renameSync(`${indexPath}.tmp`, indexPath); };
  for (const run of index.runs) if (run.status === 'running') { run.status = 'interrupted'; run.errorCode = 'SERVER_RESTARTED'; }
  save();
  let client;
  try { client = await connectUndoLane(join(directory, 'workspace.sqlite')); }
  catch (error) { engine.close(); throw error; }
  let active: Promise<void> | undefined;
  const liveAvailable = () => { try { providerConfig(); return true; } catch { return false; } };
  const result = async <K extends keyof typeof outputs>(name: K, args: Record<string, unknown>) => {
    const response = await client.callTool({ name, arguments: args });
    if (response.isError) {
      const data = response.structuredContent as { error?: { code?: string } } | undefined;
      throw new AgentError(data?.error?.code ?? 'MCP_TOOL_ERROR');
    }
    return outputs[name].parse(response.structuredContent);
  };
  return {
    workspace(): Workspace {
      return { assets: engine.listAssets(), revision: engine.workspaceRevision, runs: index.runs,
        actions: index.runs.flatMap(run => [...run.actionIds].reverse().map(id => ({ action: engine.getAction(id),
          effects: engine.getEffects(id), runId: run.id, mode: run.mode, createdAt: run.startedAt, receipt: index.receipts[id] }))),
        liveAvailable: liveAvailable() };
    },
    action(id: string): ActionView { return { action: engine.getAction(id), effects: engine.getEffects(id), receipt: index.receipts[id] }; },
    run(id: string) { const run = index.runs.find(r => r.id === id); if (!run) throw new AgentError('NOT_FOUND'); return run; },
    startRun(task: string, mode: Mode) {
      if (active) throw new AgentError('RUN_IN_PROGRESS');
      if (mode === 'fixture' && task.trim() !== demoTask) throw new AgentError('FIXTURE_TASK_ONLY');
      const provider = mode === 'fixture' ? new FixtureProvider() : new OpenAICompatibleProvider(providerConfig());
      const run: WebRun = { id: randomUUID(), task, mode, startedAt: new Date().toISOString(), status: 'running', events: [], actionIds: [] };
      index.runs.unshift(run); save();
      active = (async () => {
        try {
          const report = await runAgent(client, provider, task, event => {
            run.events.push({ ...event, at: new Date().toISOString() });
            if (event.actionId && !run.actionIds.includes(event.actionId)) run.actionIds.push(event.actionId);
            save();
          });
          run.report = report; run.status = report.status; run.errorCode = report.errorCode;
        } catch { run.status = 'failed'; run.errorCode = 'RUN_FAILED'; }
        finally { save(); active = undefined; }
      })();
      return run;
    },
    humanPatch(body: unknown) {
      const patch = inputs.asset_patch.parse(body);
      return engine.applyAction('human', 'web-user', patch.operation_key, patch.writes.map(w => ({
        resourceId: patch.resource_id, field: w.field, expectedRevision: w.expected_revision,
        afterPresent: w.present, afterValue: w.value,
      })));
    },
    async preview(actionId: string) { return await result('undo_preview', { action_id: actionId }); },
    async commit(planId: string) {
      const receipt = outputs.undo_commit.parse(await result('undo_commit', { undo_plan_id: planId }));
      index.receipts[receipt.action_id] = receipt; save(); return receipt;
    },
    async close() { await active; await client.close(); engine.close(); },
  };
}
export type DemoService = Awaited<ReturnType<typeof createDemoService>>;
