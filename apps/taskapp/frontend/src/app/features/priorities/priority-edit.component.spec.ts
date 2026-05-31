import { PriorityResponse } from '@taskapp/shared-types';
import { applyPriorityUpdate, validateUpdatePriority } from './priority.logic';

/**
 * Pure-logic spec for the priorities *edit* view.
 *
 * Runs ts-jest in a node env (no jsdom / TestBed — see frontend/package.json), so we verify
 * the edit flow through the framework-free helpers it mirrors (`validateUpdatePriority` and
 * `applyPriorityUpdate`) rather than by rendering the component.
 */
describe('PriorityEditComponent logic', () => {
  const existing: PriorityResponse = {
    id: '1',
    name: 'Mid',
    level: 3,
    createdAt: '2026-05-31T10:00:00.000Z',
  };

  // AC6 (client mirror) — submitting a changed name preserves the unchanged fields.
  it('applies the changed field and preserves the rest', () => {
    const updated = applyPriorityUpdate(existing, { name: 'Middle' });

    expect(updated.name).toBe('Middle'); // changed
    expect(updated.level).toBe(3); // preserved
    expect(updated.id).toBe(existing.id); // preserved
    expect(updated.createdAt).toBe(existing.createdAt); // preserved
  });

  it('accepts a valid update payload', () => {
    expect(validateUpdatePriority({ name: 'Middle' })).toEqual([]);
  });

  // AC7 (client mirror) — an invalid field value is rejected before submit.
  it('rejects an invalid level on update', () => {
    const errors = validateUpdatePriority({ level: -5 });
    expect(errors.some((e) => e.includes('level'))).toBe(true);
  });

  it('treats an empty update as valid (all fields optional)', () => {
    expect(validateUpdatePriority({})).toEqual([]);
  });
});
