/**
 * Bounded task priority. Declared as a const object + matching type so it can be
 * used both as a runtime value (e.g. `@IsEnum(TaskPriority)` in the DTO) and as a
 * `'low' | 'medium' | 'high'` union type.
 */
export const TaskPriority = {
  low: 'low',
  medium: 'medium',
  high: 'high',
} as const;
export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

export const TaskStatus = {
  BACKLOG: 'BACKLOG',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: TaskPriority;
  status: TaskStatus;
  description: string | null;
  /** UTC ISO-8601 timestamp. Never store local time (see CLAUDE.md). */
  createdAt: string;
  deadline: string | null;
  assignee: string | null;
}
