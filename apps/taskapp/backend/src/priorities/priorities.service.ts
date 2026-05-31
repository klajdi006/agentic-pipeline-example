import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreatePriorityDto } from './dto/create-priority.dto';
import { UpdatePriorityDto } from './dto/update-priority.dto';
import { Priority } from './entities/priority.model';

/**
 * In-memory priority store. Production would back this with TypeORM + Postgres
 * (see CLAUDE.md); the in-memory map keeps the reference app dependency-free.
 */
@Injectable()
export class PrioritiesService {
  private readonly priorities = new Map<string, Priority>();

  create(dto: CreatePriorityDto): Priority {
    const priority: Priority = {
      id: randomUUID(),
      name: dto.name,
      level: dto.level,
      createdAt: new Date().toISOString(),
    };
    this.priorities.set(priority.id, priority);
    return priority;
  }

  findAll(): Priority[] {
    return [...this.priorities.values()];
  }

  findOne(id: string): Priority {
    const priority = this.priorities.get(id);
    if (!priority) throw new NotFoundException(`Priority ${id} not found`);
    return priority;
  }

  /** Merges the provided fields, preserving any field left undefined. */
  update(id: string, dto: UpdatePriorityDto): Priority {
    const priority = this.findOne(id);
    const updated: Priority = {
      ...priority,
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.level !== undefined ? { level: dto.level } : {}),
    };
    this.priorities.set(id, updated);
    return updated;
  }

  remove(id: string): void {
    if (!this.priorities.delete(id)) {
      throw new NotFoundException(`Priority ${id} not found`);
    }
  }
}
