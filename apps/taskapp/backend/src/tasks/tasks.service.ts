import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreateTaskDto } from './dto/create-task.dto';
import { Task } from './task.model';

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
      completed: false,
      createdAt: new Date().toISOString(),
    };
    this.tasks.set(task.id, task);
    return task;
  }

  findAll(): Task[] {
    return [...this.tasks.values()];
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
}
