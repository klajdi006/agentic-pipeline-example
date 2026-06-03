import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreateTaskDto } from './dto/create-task.dto';
import { Task, TaskPriority, TaskStatus } from './task.model';

/** Sort weight for priority ordering: high first, then medium, then low. */
const PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * In-memory task store. Production would back this with TypeORM + Postgres
 * (see CLAUDE.md), but the in-memory map keeps the reference app dependency-free
 * and the test suite fast.
 */
@Injectable()
export class TasksService {
  private readonly tasks = new Map<string, Task>();

  create(dto: CreateTaskDto): Task {
    const task: Task = {
      id: randomUUID(),
      title: dto.title,
      name: null,
      completed: false,
      priority: dto.priority ?? TaskPriority.medium,
      status: TaskStatus.BACKLOG,
      createdAt: new Date().toISOString(),
      description: dto.description ?? null,
      deadline: dto.deadline ?? null,
      assignee: dto.assignee ?? null,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  /**
   * Returns tasks ordered high → medium → low, paginated. Equal priorities keep
   * their original insertion order (stable tiebreaker on the Map's insertion index).
   */
  findAll(
    page = 1,
    limit = 20,
  ): { items: Task[]; total: number; page: number; limit: number } {
    const sorted = [...this.tasks.values()]
      .map((task, index) => ({ task, index }))
      .sort(
        (a, b) =>
          PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority] ||
          a.index - b.index,
      )
      .map(({ task }) => task);

    const total = sorted.length;
    const offset = (page - 1) * limit;
    return { items: sorted.slice(offset, offset + limit), total, page, limit };
  }

  findAllForExport(): Task[] {
    return [...this.tasks.values()].sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        a.createdAt.localeCompare(b.createdAt),
    );
  }

  findOne(id: string): Task {
    const task = this.tasks.get(id);
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  setCompleted(id: string, completed: boolean): Task {
    const task = this.findOne(id);
    task.completed = completed;
    return task;
  }

  remove(id: string): void {
    if (!this.tasks.delete(id)) throw new NotFoundException(`Task ${id} not found`);
  }

  getSummary(): { BACKLOG: number; IN_PROGRESS: number; DONE: number } {
    const counts = { BACKLOG: 0, IN_PROGRESS: 0, DONE: 0 };
    for (const task of this.tasks.values()) {
      counts[task.status]++;
    }
    return counts;
  }
}
