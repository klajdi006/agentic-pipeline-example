import { PriorityResponse } from '@taskapp/shared-types';
import {
  PRIORITY_LEVEL_MIN,
  PRIORITY_NAME_MAX_LENGTH,
  applyPriorityUpdate,
  removePriorityById,
  validateCreatePriority,
  validateUpdatePriority,
} from './priority.logic';

/**
 * Direct unit spec for the framework-free priorities client logic. Documents that the
 * client-side rules stay aligned with the backend DTOs / service semantics across the CRUD
 * acceptance criteria (TASK-142).
 */
describe('priority.logic', () => {
  describe('validateCreatePriority (mirrors CreatePriorityDto)', () => {
    it('accepts a valid payload', () => {
      expect(validateCreatePriority({ name: 'Urgent', level: 0 })).toEqual([]);
    });

    it('rejects a missing/blank name and a negative level together', () => {
      const errors = validateCreatePriority({ name: '   ', level: -1 });
      expect(errors.some((e) => e.includes('name'))).toBe(true);
      expect(errors.some((e) => e.includes('level'))).toBe(true);
    });

    it('rejects a name at the max-length boundary + 1', () => {
      expect(validateCreatePriority({ name: 'x'.repeat(PRIORITY_NAME_MAX_LENGTH), level: 0 })).toEqual([]);
      expect(
        validateCreatePriority({ name: 'x'.repeat(PRIORITY_NAME_MAX_LENGTH + 1), level: 0 }),
      ).not.toEqual([]);
    });

    it('rejects a non-integer level', () => {
      expect(validateCreatePriority({ name: 'A', level: 1.5 })).not.toEqual([]);
    });

    it('accepts the minimum allowed level', () => {
      expect(validateCreatePriority({ name: 'A', level: PRIORITY_LEVEL_MIN })).toEqual([]);
    });
  });

  describe('validateUpdatePriority (mirrors UpdatePriorityDto — all optional)', () => {
    it('accepts an empty payload', () => {
      expect(validateUpdatePriority({})).toEqual([]);
    });

    it('accepts a single valid field', () => {
      expect(validateUpdatePriority({ level: 2 })).toEqual([]);
      expect(validateUpdatePriority({ name: 'Renamed' })).toEqual([]);
    });

    it('rejects a present-but-invalid field', () => {
      expect(validateUpdatePriority({ name: '' })).not.toEqual([]);
      expect(validateUpdatePriority({ level: -1 })).not.toEqual([]);
    });
  });

  describe('removePriorityById', () => {
    const list: PriorityResponse[] = [
      { id: 'a', name: 'A', level: 1, createdAt: '2026-05-31T10:00:00.000Z' },
      { id: 'b', name: 'B', level: 2, createdAt: '2026-05-31T11:00:00.000Z' },
    ];

    it('drops the matching id and keeps the rest', () => {
      expect(removePriorityById(list, 'a').map((p) => p.id)).toEqual(['b']);
    });

    it('is a no-op for an unknown id and never mutates the input', () => {
      expect(removePriorityById(list, 'zzz')).toEqual(list);
      expect(list.map((p) => p.id)).toEqual(['a', 'b']);
    });
  });

  describe('applyPriorityUpdate (mirrors the service merge — AC6)', () => {
    const existing: PriorityResponse = {
      id: '1',
      name: 'Mid',
      level: 3,
      createdAt: '2026-05-31T10:00:00.000Z',
    };

    it('overrides provided fields and preserves undefined ones', () => {
      expect(applyPriorityUpdate(existing, { level: 1 })).toEqual({ ...existing, level: 1 });
    });

    it('preserves everything for an empty update and does not mutate the input', () => {
      expect(applyPriorityUpdate(existing, {})).toEqual(existing);
      expect(existing.name).toBe('Mid');
    });
  });
});
