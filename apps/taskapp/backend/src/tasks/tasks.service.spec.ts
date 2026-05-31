import { NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(() => {
    service = new TasksService();
  });

  it('creates a task with completed=false and a UTC ISO-8601 createdAt', () => {
    const task = service.create({ title: 'Write docs' });

    expect(task.id).toBeDefined();
    expect(task.title).toBe('Write docs');
    expect(task.completed).toBe(false);
    // createdAt must round-trip as a UTC ISO string (no local-time storage)
    expect(task.createdAt).toBe(new Date(task.createdAt).toISOString());
  });

  it('lists all created tasks', () => {
    service.create({ title: 'A' });
    service.create({ title: 'B' });
    expect(service.findAll()).toHaveLength(2);
  });

  it('marks a task complete', () => {
    const task = service.create({ title: 'Ship it' });
    expect(service.setCompleted(task.id, true).completed).toBe(true);
  });

  it('throws NotFound for a missing task', () => {
    expect(() => service.findOne('missing')).toThrow(NotFoundException);
  });
});
