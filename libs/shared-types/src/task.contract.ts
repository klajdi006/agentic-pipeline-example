import { PaginatedResponse } from './pagination.contract';

export type TaskPriority = 'low' | 'medium' | 'high';

export interface TaskResponse {
  id: string;
  title: string;
  completed: boolean;
  priority: TaskPriority;
  /** UTC ISO-8601 timestamp. */
  createdAt: string;
}

export type PaginatedTasksResponse = PaginatedResponse<TaskResponse>;
