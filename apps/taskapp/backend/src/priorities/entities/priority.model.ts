/**
 * In-memory Priority record for the priorities resource.
 *
 * Mirrors the canonical `Priority` contract in `libs/shared-types` (kept self-contained
 * here, like `tasks/task.model.ts`, so the backend builds without reaching outside its
 * own `src/` tree). `createdAt` is a UTC ISO-8601 string — never local time (see CLAUDE.md).
 */
export interface Priority {
  id: string;
  name: string;
  /** Numeric rank (lower = higher priority). */
  level: number;
  /** UTC ISO-8601 timestamp. */
  createdAt: string;
}
