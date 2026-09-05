import { describe, it, expect } from 'vitest';
import { isRecognizedField, validateFieldWritePayload } from '../packages/engine/validator.ts';
import { InvalidActionPayloadError } from '../packages/contracts/index.ts';

describe('Engine Validator Unit Tests', () => {
  describe('isRecognizedField', () => {
    it('returns true for all valid domain field names', () => {
      expect(isRecognizedField('display_name')).toBe(true);
      expect(isRecognizedField('campaign')).toBe(true);
      expect(isRecognizedField('status')).toBe(true);
      expect(isRecognizedField('note')).toBe(true);
    });

    it('returns false for unknown field names or prototype properties', () => {
      expect(isRecognizedField('unknown_field')).toBe(false);
      expect(isRecognizedField('toString')).toBe(false);
      expect(isRecognizedField('')).toBe(false);
    });
  });

  describe('validateFieldWritePayload', () => {
    it('accepts valid field write payloads with string values', () => {
      const payload = {
        resourceId: 'asset_a',
        field: 'display_name',
        expectedRevision: 1,
        afterPresent: true,
        afterValue: 'Hero Display'
      };
      const result = validateFieldWritePayload(payload);
      expect(result).toEqual(payload);
    });

    it('accepts valid field write payloads with null values', () => {
      const payload = {
        resourceId: 'asset_b',
        field: 'campaign',
        expectedRevision: 0,
        afterPresent: false,
        afterValue: null
      };
      const result = validateFieldWritePayload(payload);
      expect(result).toEqual(payload);
    });

    it('rejects non-object payloads', () => {
      expect(() => validateFieldWritePayload(null)).toThrow(InvalidActionPayloadError);
      expect(() => validateFieldWritePayload('not-an-object')).toThrow(InvalidActionPayloadError);
    });

    it('rejects empty or non-string resourceId', () => {
      expect(() => validateFieldWritePayload({
        resourceId: '   ',
        field: 'status',
        expectedRevision: 0,
        afterPresent: true,
        afterValue: 'active'
      })).toThrow(InvalidActionPayloadError);
    });

    it('rejects unrecognized field names in write payload', () => {
      expect(() => validateFieldWritePayload({
        resourceId: 'asset_a',
        field: 'illegal_field',
        expectedRevision: 0,
        afterPresent: true,
        afterValue: 'test'
      })).toThrow(InvalidActionPayloadError);
    });

    it('rejects negative or fractional expected revisions', () => {
      expect(() => validateFieldWritePayload({
        resourceId: 'asset_a',
        field: 'status',
        expectedRevision: -1,
        afterPresent: true,
        afterValue: 'active'
      })).toThrow(InvalidActionPayloadError);

      expect(() => validateFieldWritePayload({
        resourceId: 'asset_a',
        field: 'status',
        expectedRevision: 1.5,
        afterPresent: true,
        afterValue: 'active'
      })).toThrow(InvalidActionPayloadError);
    });
  });
});
