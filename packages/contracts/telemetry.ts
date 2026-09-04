import { UndoDecision } from './index.ts';

export interface UndoMetrics {
  totalActionsRecorded: number;
  totalEffectsRecorded: number;
  totalPreviewsGenerated: number;
  totalCommitsExecuted: number;
  totalFieldsRestored: number;
  totalFieldsPreserved: number;
}

export interface ActionTelemetryPayload {
  actionId: string;
  actorKind: 'human' | 'agent';
  affectedFieldsCount: number;
  durationMs: number;
}

export interface PreviewTelemetryPayload {
  planId: string;
  targetActionId: string;
  decisionBreakdown: Record<UndoDecision, number>;
  eligiblePercentage: number;
  durationMs: number;
}

export interface CommitTelemetryPayload {
  planId: string;
  receiptId: string;
  status: 'undone' | 'partially_undone' | 'unchanged';
  restoredCount: number;
  preservedCount: number;
  durationMs: number;
}

export class InMemoryTelemetryReporter {
  private metrics: UndoMetrics = {
    totalActionsRecorded: 0,
    totalEffectsRecorded: 0,
    totalPreviewsGenerated: 0,
    totalCommitsExecuted: 0,
    totalFieldsRestored: 0,
    totalFieldsPreserved: 0
  };

  recordAction(payload: ActionTelemetryPayload): void {
    this.metrics.totalActionsRecorded += 1;
    this.metrics.totalEffectsRecorded += payload.affectedFieldsCount;
  }

  recordPreview(payload: PreviewTelemetryPayload): void {
    this.metrics.totalPreviewsGenerated += 1;
  }

  recordCommit(payload: CommitTelemetryPayload): void {
    this.metrics.totalCommitsExecuted += 1;
    this.metrics.totalFieldsRestored += payload.restoredCount;
    this.metrics.totalFieldsPreserved += payload.preservedCount;
  }

  getSnapshot(): Readonly<UndoMetrics> {
    return { ...this.metrics };
  }

  reset(): void {
    this.metrics = {
      totalActionsRecorded: 0,
      totalEffectsRecorded: 0,
      totalPreviewsGenerated: 0,
      totalCommitsExecuted: 0,
      totalFieldsRestored: 0,
      totalFieldsPreserved: 0
    };
  }
}
