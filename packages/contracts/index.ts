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
