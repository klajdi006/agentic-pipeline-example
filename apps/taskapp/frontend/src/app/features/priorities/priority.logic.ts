import { CreatePriorityRequest, PriorityResponse, UpdatePriorityRequest } from '@taskapp/shared-types';

/**
 * Framework-free priorities client logic — the single source of truth for the rules the
 * Angular components enforce, kept pure (no Angular imports) so it is unit-testable with
 * ts-jest and no TestBed, exactly like `shared/sort.ts`.
 *
 * The validation mirrors the backend DTOs (`CreatePriorityDto` / `UpdatePriorityDto`) so the
 * client rejects the same inputs the API would (mirroring AC2/AC7), and the list helpers
 * model the optimistic local edits the list view performs (mirroring AC6/AC8).
 */

/** Mirrors `@MaxLength(100)` on the DTO `name`. */
export const PRIORITY_NAME_MAX_LENGTH = 100;
/** Mirrors `@Min(0)` on the DTO `level`. */
export const PRIORITY_LEVEL_MIN = 0;

function nameErrors(name: unknown): string[] {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return ['name is required'];
  }
  if (name.length > PRIORITY_NAME_MAX_LENGTH) {
    return [`name must be at most ${PRIORITY_NAME_MAX_LENGTH} characters`];
  }
  return [];
}

function levelErrors(level: unknown): string[] {
  if (typeof level !== 'number' || !Number.isInteger(level)) {
    return ['level must be an integer'];
  }
  if (level < PRIORITY_LEVEL_MIN) {
    return [`level must be ${PRIORITY_LEVEL_MIN} or greater`];
  }
  return [];
}

/** Validates a create payload, mirroring `CreatePriorityDto`. Empty array ⇒ valid. */
export function validateCreatePriority(input: Partial<CreatePriorityRequest>): string[] {
  return [...nameErrors(input.name), ...levelErrors(input.level)];
}

/**
 * Validates an update payload, mirroring `UpdatePriorityDto`: every field is optional, but a
 * field that *is* present must still be valid. An empty payload is valid.
 */
export function validateUpdatePriority(input: UpdatePriorityRequest): string[] {
  const errors: string[] = [];
  if (input.name !== undefined) errors.push(...nameErrors(input.name));
  if (input.level !== undefined) errors.push(...levelErrors(input.level));
  return errors;
}

/**
 * Optimistic local removal used by the list view after a successful DELETE — returns a new
 * list without the given id (mirrors AC8 on the client). Pure: never mutates the input.
 */
export function removePriorityById(
  list: readonly PriorityResponse[],
  id: string,
): PriorityResponse[] {
  return list.filter((p) => p.id !== id);
}

/**
 * Merges an update onto an existing priority, preserving any field left undefined — the
 * client mirror of the service's merge semantics (AC6). Pure: returns a new object.
 */
export function applyPriorityUpdate(
  priority: PriorityResponse,
  update: UpdatePriorityRequest,
): PriorityResponse {
  return {
    ...priority,
    ...(update.name !== undefined ? { name: update.name } : {}),
    ...(update.level !== undefined ? { level: update.level } : {}),
  };
}
