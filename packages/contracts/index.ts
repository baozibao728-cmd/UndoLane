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
