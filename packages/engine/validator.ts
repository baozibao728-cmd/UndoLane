import { Field, fields, FieldWrite, InvalidActionPayloadError, Scalar } from '../contracts/index.ts';

export function isRecognizedField(name: string): name is Field {
  return (fields as readonly string[]).includes(name);
}

export function validateFieldWritePayload(write: unknown): FieldWrite {
  if (typeof write !== 'object' || write === null) {
    throw new InvalidActionPayloadError('Field write payload must be a non-null object');
  }

  const candidate = write as Record<string, unknown>;

  if (typeof candidate.resourceId !== 'string' || candidate.resourceId.trim() === '') {
    throw new InvalidActionPayloadError('resourceId must be a non-empty string');
  }

  if (typeof candidate.field !== 'string' || !isRecognizedField(candidate.field)) {
    throw new InvalidActionPayloadError(`field '${String(candidate.field)}' is not a recognized field name`);
  }

  if (typeof candidate.expectedRevision !== 'number' || candidate.expectedRevision < 0 || !Number.isInteger(candidate.expectedRevision)) {
    throw new InvalidActionPayloadError('expectedRevision must be a non-negative integer');
  }

  if (typeof candidate.afterPresent !== 'boolean') {
    throw new InvalidActionPayloadError('afterPresent must be a boolean flag');
  }

  return {
    resourceId: candidate.resourceId,
    field: candidate.field,
    expectedRevision: candidate.expectedRevision,
    afterPresent: candidate.afterPresent,
    afterValue: (candidate.afterValue as Scalar) ?? null
  };
}
