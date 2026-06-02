import { Task, TaskPriority } from '../../shared/task.model';

/**
 * Framework-free tasks client logic — the single source of truth for the rules the
 * Angular v21 task components enforce, kept pure (no Angular imports) so it is
 * unit-testable with ts-jest and no TestBed, exactly like `shared/sort.ts` and
 * `priorities/priority.logic.ts`.
 *
 * The TASK-142 upgrade (signals, OnPush, @if/@for control flow) is template/state-only:
 * the backend task contract the frontend consumes must stay unchanged. These helpers
 * mirror that contract so the client validates the same create input the API would
 * (mirroring AC-5), recognises the same Task shape the list/create endpoints return
 * (AC-1/AC-2), and models the local completed/deleted edits the views perform after a
 * successful PATCH/DELETE (AC-3/AC-4).
 */

/** Mirrors `@MaxLength(200)` on `CreateTaskDto.title`. */
export const TASK_TITLE_MAX_LENGTH = 200;

/**
 * Validates a create payload, mirroring `CreateTaskDto` (`@IsString` + `@IsNotEmpty` +
 * `@MaxLength(200)` on `title`). Empty array ⇒ valid. (Mirrors AC-5 on the client.)
 */
export function validateCreateTask(input: { title?: unknown }): string[] {
  const { title } = input;
  if (typeof title !== 'string' || title.trim().length === 0) {
    return ['title is required'];
  }
  if (title.length > TASK_TITLE_MAX_LENGTH) {
    return [`title must be at most ${TASK_TITLE_MAX_LENGTH} characters`];
  }
  return [];
}

/**
 * Type guard for the Task shape the list/create endpoints return: id, title, completed,
 * and a `createdAt` that is a valid UTC ISO-8601 string. Used to assert the wire contract
 * the upgraded frontend depends on stays intact (mirrors AC-1/AC-2).
 */
export function isTask(value: unknown): value is Task {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;
  const validPriority = t['priority'] === 'low' || t['priority'] === 'medium' || t['priority'] === 'high';
  return (
    typeof t['id'] === 'string' &&
    typeof t['title'] === 'string' &&
    typeof t['completed'] === 'boolean' &&
    validPriority &&
    typeof t['createdAt'] === 'string' &&
    isUtcIso8601(t['createdAt'])
  );
}

/** True when `value` round-trips through `Date` as the same UTC ISO-8601 string. */
export function isUtcIso8601(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

/**
 * Marks a task complete locally after a successful `PATCH /tasks/:id/complete` — returns a
 * new task with `completed: true` (mirrors AC-3 on the client). Pure: never mutates input.
 */
export function markCompleted(task: Task): Task {
  return { ...task, completed: true };
}

/**
 * Optimistic local removal used by the list view after a successful DELETE — returns a new
 * list without the given id (mirrors AC-4 on the client). Pure: never mutates the input.
 */
export function removeTaskById(list: readonly Task[], id: string): Task[] {
  return list.filter((t) => t.id !== id);
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

/**
 * Returns a new array sorted by priority rank (high first) then createdAt ascending,
 * mirroring the backend's findAllForExport() sort order (AC-9).
 */
export function sortTasksForExport(tasks: readonly Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      a.createdAt.localeCompare(b.createdAt),
  );
}
