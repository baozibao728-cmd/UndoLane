export const fields = ['display_name', 'campaign', 'status', 'note'] as const;
export type Field = typeof fields[number];
export type Scalar = string | number | boolean | null;
export interface FieldState {
  resourceId: string; field: Field; present: boolean; value: Scalar;
  revision: number; activeEffectId: string | null; lastMutationId: string | null;
}
export interface FieldWrite {
  resourceId: string; field: Field; expectedRevision: number;
  afterPresent: boolean; afterValue: Scalar;
}
export interface Action { id: string; actorKind: 'human' | 'agent'; actorId: string; operationKey: string }
export type FieldMutation = {
  kind: 'effect'; id: string; action: Action; effect: Effect;
} | {
  kind: 'compensation'; id: string; undoCommitId: string; effectId: string;
  beforeRevision: number; afterRevision: number;
};
export interface AssetSnapshot {
  resourceId: string;
  fields: Record<Field, FieldState>;
  recentMutations: Record<Field, FieldMutation | null>;
}
export interface Effect {
  id: string; actionId: string; resourceId: string; field: Field;
  beforePresent: boolean; beforeValue: Scalar; beforeRevision: number;
  previousEffectId: string | null; afterPresent: boolean; afterValue: Scalar; afterRevision: number;
}
export type UndoDecision = 'eligible' | 'protected' | 'blocked' | 'already_undone' | 'unsupported';
export interface UndoItem {
  effectId: string; resourceId: string; field: Field; decision: UndoDecision; reason: string;
  current: FieldState; restorePresent: boolean; restoreValue: Scalar; previousEffectId: string | null;
}
export interface UndoPlan {
  planId: string; targetActionId: string; planHash: string; baseWorkspaceRevision: number;
  expiresAt: number; items: UndoItem[];
}
export interface UndoReceipt {
  id: string; planId: string; targetActionId: string; restored: string[]; preserved: string[];
  workspaceRevision: number; status: 'undone' | 'partially_undone' | 'unchanged';
}
export class UndoLaneError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; this.name = 'UndoLaneError'; }
}

export class RevisionConflictError extends UndoLaneError {
  readonly resourceId: string;
  readonly field: string;
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(resourceId: string, field: string, expectedRevision: number, actualRevision: number) {
    super(`REVISION_CONFLICT: field '${field}' on resource '${resourceId}' expected revision ${expectedRevision}, found ${actualRevision}`);
    this.name = 'RevisionConflictError';
    this.resourceId = resourceId;
    this.field = field;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export class StalePlanError extends UndoLaneError {
  readonly planId: string;
  readonly expectedWorkspaceRevision: number;
  readonly currentWorkspaceRevision: number;

  constructor(planId: string, expectedWorkspaceRevision: number, currentWorkspaceRevision: number) {
    super(`STALE_PLAN: undo plan '${planId}' was generated against workspace revision ${expectedWorkspaceRevision}, but current revision is ${currentWorkspaceRevision}`);
    this.name = 'StalePlanError';
    this.planId = planId;
    this.expectedWorkspaceRevision = expectedWorkspaceRevision;
    this.currentWorkspaceRevision = currentWorkspaceRevision;
  }
}

export class AssetNotFoundError extends UndoLaneError {
  readonly resourceId: string;

  constructor(resourceId: string) {
    super(`ASSET_NOT_FOUND: asset '${resourceId}' does not exist in the active workspace`);
    this.name = 'AssetNotFoundError';
    this.resourceId = resourceId;
  }
}

export class InvalidActionPayloadError extends UndoLaneError {
  readonly reason: string;

  constructor(reason: string) {
    super(`INVALID_ACTION_PAYLOAD: ${reason}`);
    this.name = 'InvalidActionPayloadError';
    this.reason = reason;
  }
}

export interface ActionRecordedEvent {
  type: 'action_recorded';
  action: Action;
  effects: Effect[];
  timestamp: number;
}

export interface UndoPreviewGeneratedEvent {
  type: 'undo_preview_generated';
  planId: string;
  targetActionId: string;
  eligibleCount: number;
  protectedCount: number;
  items: UndoItem[];
  timestamp: number;
}

export interface UndoCommittedEvent {
  type: 'undo_committed';
  receipt: UndoReceipt;
  restoredCount: number;
  preservedCount: number;
  timestamp: number;
}

export type DomainEvent = ActionRecordedEvent | UndoPreviewGeneratedEvent | UndoCommittedEvent;




