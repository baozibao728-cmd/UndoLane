import { expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDemoService } from '../apps/server/service.ts';
import { demoTask } from '../apps/shared/types.ts';
import { outputs } from '../packages/mcp-server/schemas.ts';

it('Web metadata survives restart while Action/Effect and receipts remain engine-owned', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'undolane-web-service-'));
  let service = await createDemoService(directory);
  try {
    const run = service.startRun(demoTask, 'fixture');
    expect(() => service.startRun(demoTask, 'fixture')).toThrow('RUN_IN_PROGRESS');
    await service.close();
    service = await createDemoService(directory);
    const workspace = service.workspace();
    expect(workspace.runs[0].id).toBe(run.id);
    expect(workspace.runs[0].status).toBe('completed');
    expect(workspace.actions).toHaveLength(2);
    const action = workspace.actions.find(a => a.effects[0].resourceId === 'asset_b')!;
    service.humanPatch({ resource_id: 'asset_b', operation_key: 'human-test', writes: [
      { field: 'display_name', value: 'Hero — Final', expected_revision: 1 },
    ] });
    const plan = outputs.undo_preview.parse(await service.preview(action.action.id));
    expect(plan).toMatchObject({ eligible: 1, protected: 1 });
    const receipt = await service.commit(plan.undo_plan_id);
    expect(receipt.status).toBe('partially_undone');
    await service.close(); service = await createDemoService(directory);
    expect(service.action(action.action.id).receipt).toEqual(receipt);
    expect(service.action(action.action.id).effects).toEqual(action.effects);
    expect(service.workspace().assets.find(a => a.resourceId === 'asset_b')!.fields.display_name.value).toBe('Hero — Final');
  } finally { await service.close(); rmSync(directory, { recursive: true, force: true }); }
}, 20_000);
