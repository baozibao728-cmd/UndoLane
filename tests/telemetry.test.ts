import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTelemetryReporter } from '../packages/contracts/telemetry.ts';

describe('InMemoryTelemetryReporter Unit Tests', () => {
  let reporter: InMemoryTelemetryReporter;

  beforeEach(() => {
    reporter = new InMemoryTelemetryReporter();
  });

  it('initializes with all metrics at zero', () => {
    const metrics = reporter.getSnapshot();
    expect(metrics.totalActionsRecorded).toBe(0);
    expect(metrics.totalEffectsRecorded).toBe(0);
    expect(metrics.totalPreviewsGenerated).toBe(0);
    expect(metrics.totalCommitsExecuted).toBe(0);
    expect(metrics.totalFieldsRestored).toBe(0);
    expect(metrics.totalFieldsPreserved).toBe(0);
  });

  it('accumulates recorded action metrics', () => {
    reporter.recordAction({
      actionId: 'act_1',
      actorKind: 'agent',
      affectedFieldsCount: 3,
      durationMs: 15
    });
    reporter.recordAction({
      actionId: 'act_2',
      actorKind: 'human',
      affectedFieldsCount: 1,
      durationMs: 5
    });

    const metrics = reporter.getSnapshot();
    expect(metrics.totalActionsRecorded).toBe(2);
    expect(metrics.totalEffectsRecorded).toBe(4);
  });

  it('accumulates preview and commit metrics correctly', () => {
    reporter.recordPreview({
      planId: 'plan_1',
      targetActionId: 'act_1',
      decisionBreakdown: { eligible: 2, protected: 1, blocked: 0, already_undone: 0, unsupported: 0 },
      eligiblePercentage: 66.7,
      durationMs: 10
    });

    reporter.recordCommit({
      planId: 'plan_1',
      receiptId: 'rcpt_1',
      status: 'partially_undone',
      restoredCount: 2,
      preservedCount: 1,
      durationMs: 25
    });

    const metrics = reporter.getSnapshot();
    expect(metrics.totalPreviewsGenerated).toBe(1);
    expect(metrics.totalCommitsExecuted).toBe(1);
    expect(metrics.totalFieldsRestored).toBe(2);
    expect(metrics.totalFieldsPreserved).toBe(1);
  });

  it('resets all metrics back to zero on reset()', () => {
    reporter.recordAction({
      actionId: 'act_1',
      actorKind: 'agent',
      affectedFieldsCount: 5,
      durationMs: 20
    });
    reporter.reset();
    expect(reporter.getSnapshot().totalActionsRecorded).toBe(0);
  });
});
