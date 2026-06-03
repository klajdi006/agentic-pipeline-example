import { PriorityResponse } from '@taskapp/shared-types';
import { removePriorityById } from '../priority.logic';

/**
 * Pure-logic spec for the priorities *list* view.
 *
 * This dependency-free skeleton runs ts-jest in a node env (no jsdom / TestBed / Angular
 * rendering — see frontend/package.json), so we verify the list's behavior through the
 * framework-free helper it uses (`removePriorityById`) rather than by rendering the
 * component, mirroring the `shared/sort.spec.ts` approach.
 *
 * The template renders the list with the Angular v21 `@for (...; track p.id) { } @empty { }`
 * control-flow block, so the helper output below is exactly what drives those branches:
 * a non-empty result renders `@for` rows, an empty result renders the `@empty` block.
 */
describe('PriorityListComponent logic', () => {
  const priorities: PriorityResponse[] = [
    { id: '1', name: 'Urgent', level: 0, createdAt: '2026-05-31T10:00:00.000Z' },
    { id: '2', name: 'Low', level: 5, createdAt: '2026-05-31T11:00:00.000Z' },
  ];

  // AC8 (client mirror) — after a successful delete the list drops only that priority.
  it('removes the deleted priority from the rendered list', () => {
    expect(removePriorityById(priorities, '1')).toEqual([priorities[1]]);
  });

  it('leaves the list unchanged when the id is not present', () => {
    expect(removePriorityById(priorities, 'missing')).toEqual(priorities);
  });

  it('does not mutate the source list (signal stays immutable)', () => {
    removePriorityById(priorities, '1');
    expect(priorities.map((p) => p.id)).toEqual(['1', '2']);
  });

  // Deleting the last row empties the signal, which drives the `@empty` ("No priorities yet") branch.
  it('yields an empty list once the last priority is removed (@empty branch)', () => {
    const remaining = removePriorityById([priorities[0]], '1');
    expect(remaining).toEqual([]);
  });
});
