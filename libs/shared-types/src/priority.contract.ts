/**
 * Priority contracts — the single source of truth for the priorities resource,
 * imported by both the NestJS API and the Angular client.
 *
 * `level` is a numeric rank (lower = higher priority, mirroring the high→medium→low
 * ordering convention in the tasks module). `createdAt` is always a UTC ISO-8601
 * string — never local time (see CLAUDE.md).
 */
export interface Priority {
  id: string;
  name: string;
  level: number;
  /** UTC ISO-8601 timestamp. */
  createdAt: string;
}

/** Body for `POST /priorities`. */
export interface CreatePriorityRequest {
  name: string;
  level: number;
}

/** Body for `PATCH /priorities/:id` — every field is optional. */
export type UpdatePriorityRequest = Partial<CreatePriorityRequest>;

/** Shape returned by every priorities endpoint. */
export type PriorityResponse = Priority;
