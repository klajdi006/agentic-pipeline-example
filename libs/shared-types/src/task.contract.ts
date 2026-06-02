import { PaginatedResponse } from './pagination.contract';

export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'BACKLOG' | 'IN_PROGRESS' | 'DONE';

export interface TaskResponse {
  id: string;
  title: string;
  completed: boolean;
  priority: TaskPriority;
  status: TaskStatus;
  description: string | null;
  /** UTC ISO-8601 timestamp. */
  createdAt: string;
  deadline: string | null;
  assignee: string | null;
}

export type PaginatedTasksResponse = PaginatedResponse<TaskResponse>;
