import { validateCreatePriority } from './priority.logic';

/**
 * Pure-logic spec for the priorities *create* view.
 *
 * Runs ts-jest in a node env (no jsdom / TestBed — see frontend/package.json), so we verify
 * the form's validation rules through the framework-free helper the form mirrors
 * (`validateCreatePriority`) rather than by rendering the component.
 *
 * The template now gates each error message behind an Angular v21 `@if (control.touched &&
 * control.invalid)` block: a non-empty error list below means that `@if` branch renders.
 */
describe('PriorityCreateComponent logic', () => {
  // AC1 (client mirror) — a valid payload passes client validation before submit.
  it('accepts a valid create payload (no @if error blocks render)', () => {
    expect(validateCreatePriority({ name: 'Urgent', level: 0 })).toEqual([]);
  });

  // AC2 (client mirror) — a missing name and/or negative level is rejected before submit.
  it('rejects a missing name (@if name-error block renders)', () => {
    const errors = validateCreatePriority({ name: '', level: 0 });
    expect(errors).toContain('name is required');
  });

  it('rejects a negative level (@if level-error block renders)', () => {
    const errors = validateCreatePriority({ name: 'Urgent', level: -1 });
    expect(errors.some((e) => e.includes('level'))).toBe(true);
  });

  it('rejects a name longer than 100 characters', () => {
    const errors = validateCreatePriority({ name: 'x'.repeat(101), level: 0 });
    expect(errors.some((e) => e.includes('name'))).toBe(true);
  });
});
