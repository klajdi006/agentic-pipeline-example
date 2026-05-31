import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskPriority } from './task.model';
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

  describe('priority', () => {
    it('defaults priority to "medium" when omitted on create', () => {
      const task = service.create({ title: 'No priority given' });
      expect(task.priority).toBe('medium');
    });

    it('persists and returns an explicit "high" priority', () => {
      const created = service.create({ title: 'Urgent', priority: 'high' });
      expect(created.priority).toBe('high');
      // round-trips through the store
      expect(service.findOne(created.id).priority).toBe('high');
    });

    it('orders findAll() high → medium → low', () => {
      service.create({ title: 'lo', priority: 'low' });
      service.create({ title: 'hi', priority: 'high' });
      service.create({ title: 'mid', priority: 'medium' });

      expect(service.findAll().map((t) => t.title)).toEqual(['hi', 'mid', 'lo']);
    });

    it('keeps insertion order for equal priorities (stable tiebreaker)', () => {
      service.create({ title: 'first', priority: 'high' });
      service.create({ title: 'second', priority: 'high' });
      service.create({ title: 'third', priority: 'high' });

      expect(service.findAll().map((t) => t.title)).toEqual([
        'first',
        'second',
        'third',
      ]);
    });

    it('rejects an out-of-range priority at the DTO boundary', () => {
      const dto = plainToInstance(CreateTaskDto, {
        title: 'Bad priority',
        priority: 'urgent',
      });

      const errors = validateSync(dto);
      expect(errors.some((e) => e.property === 'priority')).toBe(true);
    });

    it('returns a priority that is one of low|medium|high on every task', () => {
      service.create({ title: 'defaulted' });
      service.create({ title: 'explicit low', priority: 'low' });
      service.create({ title: 'explicit high', priority: 'high' });

      const allowed: TaskPriority[] = ['low', 'medium', 'high'];
      for (const task of service.findAll()) {
        expect(task).toHaveProperty('priority');
        expect(allowed).toContain(task.priority);
      }
    });
  });
});
