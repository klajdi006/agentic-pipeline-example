export interface Task {
  id: string;
  title: string;
  completed: boolean;
  /** UTC ISO-8601 timestamp. Never store local time (see CLAUDE.md). */
  createdAt: string;
}
