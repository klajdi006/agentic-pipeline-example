import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
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

  it('status defaults to BACKLOG on create', () => {
    const task = service.create({ title: 'Status check' });
    expect(task.status).toBe('BACKLOG');
  });

  it('lists all created tasks', () => {
    service.create({ title: 'A' });
    service.create({ title: 'B' });
    expect(service.findAll().items).toHaveLength(2);
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

      expect(service.findAll().items.map((t) => t.title)).toEqual(['hi', 'mid', 'lo']);
    });

    it('keeps insertion order for equal priorities (stable tiebreaker)', () => {
      service.create({ title: 'first', priority: 'high' });
      service.create({ title: 'second', priority: 'high' });
      service.create({ title: 'third', priority: 'high' });

      expect(service.findAll().items.map((t) => t.title)).toEqual([
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
      for (const task of service.findAll().items) {
        expect(task).toHaveProperty('priority');
        expect(allowed).toContain(task.priority);
      }
    });
  });

  describe('findAllForExport', () => {
    it('returns empty array when store is empty', () => {
      expect(service.findAllForExport()).toEqual([]);
    });

    it('returns all tasks sorted high → medium → low then createdAt ascending', () => {
      service.create({ title: 'lo', priority: 'low' });
      service.create({ title: 'hi', priority: 'high' });
      service.create({ title: 'mid', priority: 'medium' });

      const result = service.findAllForExport();
      expect(result.map((t) => t.title)).toEqual(['hi', 'mid', 'lo']);
    });

    it('returns full unpaginated list regardless of task count', () => {
      for (let i = 0; i < 25; i++) service.create({ title: `Task ${i}` });
      expect(service.findAllForExport()).toHaveLength(25);
    });

    it('secondary sort by createdAt ascending for equal-priority tasks', () => {
      const a = service.create({ title: 'first', priority: 'high' });
      const b = service.create({ title: 'second', priority: 'high' });
      const result = service.findAllForExport();
      expect(result[0].id).toBe(a.id);
      expect(result[1].id).toBe(b.id);
    });
  });

  describe('pagination', () => {
    it('returns page=1, limit=20 by default with correct total', () => {
      for (let i = 0; i < 5; i++) service.create({ title: `Task ${i}` });
      const result = service.findAll();
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(5);
      expect(result.items).toHaveLength(5);
    });

    it('slices correctly for custom page and limit', () => {
      for (let i = 1; i <= 25; i++) service.create({ title: `Task ${i}` });
      const result = service.findAll(2, 10);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.total).toBe(25);
      expect(result.items).toHaveLength(10);
    });

    it('returns empty items and correct total when page exceeds available data', () => {
      for (let i = 0; i < 5; i++) service.create({ title: `Task ${i}` });
      const result = service.findAll(10, 20);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(5);
    });

    it('total reflects full store size regardless of page/limit', () => {
      for (let i = 0; i < 50; i++) service.create({ title: `Task ${i}` });
      const p1 = service.findAll(1, 20);
      const p3 = service.findAll(3, 20);
      expect(p1.total).toBe(50);
      expect(p3.total).toBe(50);
      expect(p1.items).toHaveLength(20);
      expect(p3.items).toHaveLength(10);
    });

    // AC-1: 25 tasks, default params → exactly 20 items on page 1
    it('AC-1: 25 tasks, no params → 20 items, total=25, page=1, limit=20', () => {
      for (let i = 1; i <= 25; i++) service.create({ title: `Task ${i}` });
      const result = service.findAll();
      expect(result.items).toHaveLength(20);
      expect(result.total).toBe(25);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    // AC-3: 25 tasks, page=3, limit=10 → 5 items (partial last page), total=25
    it('AC-3: 25 tasks, page=3, limit=10 → 5 items, total=25', () => {
      for (let i = 1; i <= 25; i++) service.create({ title: `Task ${i}` });
      const result = service.findAll(3, 10);
      expect(result.items).toHaveLength(5);
      expect(result.total).toBe(25);
      expect(result.page).toBe(3);
    });

    // AC-4: 25 tasks, page=4, limit=10 → empty items, total still 25
    it('AC-4: 25 tasks, page=4, limit=10 → empty items, total=25', () => {
      for (let i = 1; i <= 25; i++) service.create({ title: `Task ${i}` });
      const result = service.findAll(4, 10);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(25);
      expect(result.page).toBe(4);
    });

    // AC-5: empty store → exact shape
    it('AC-5: empty store → { items: [], total: 0, page: 1, limit: 20 }', () => {
      const result = service.findAll();
      expect(result).toEqual({ items: [], total: 0, page: 1, limit: 20 });
    });

    // AC-9: paginated slice preserves high→medium→low priority rank
    it('AC-9: paginated items follow high→medium→low sort order', () => {
      service.create({ title: 'Low task', priority: 'low' });
      service.create({ title: 'High task', priority: 'high' });
      service.create({ title: 'Medium task', priority: 'medium' });
      service.create({ title: 'High2 task', priority: 'high' });
      service.create({ title: 'Low2 task', priority: 'low' });
      const result = service.findAll(1, 5);
      expect(result.items.map((t) => t.priority)).toEqual([
        'high',
        'high',
        'medium',
        'low',
        'low',
      ]);
    });

    // AC-10: limit larger than total → all items returned, correct total and limit echoed back
    it('AC-10: 5 tasks, limit=100 → all 5 items, total=5, limit=100', () => {
      for (let i = 1; i <= 5; i++) service.create({ title: `Task ${i}` });
      const result = service.findAll(1, 100);
      expect(result.items).toHaveLength(5);
      expect(result.total).toBe(5);
      expect(result.limit).toBe(100);
    });
  });

  describe('getSummary', () => {
    it('returns all zeros for an empty store', () => {
      expect(service.getSummary()).toEqual({ BACKLOG: 0, IN_PROGRESS: 0, DONE: 0 });
    });

    it('counts only BACKLOG tasks when all are newly created', () => {
      service.create({ title: 'A' });
      service.create({ title: 'B' });
      expect(service.getSummary()).toEqual({ BACKLOG: 2, IN_PROGRESS: 0, DONE: 0 });
    });

    it('counts tasks correctly across all three statuses', () => {
      const t1 = service.create({ title: 'Backlog task' });
      const t2 = service.create({ title: 'In-progress task' });
      const t3 = service.create({ title: 'Done task' });
      const t4 = service.create({ title: 'Done task 2' });
      // Directly mutate internal status to simulate status transitions
      (service as any).tasks.get(t2.id).status = 'IN_PROGRESS';
      (service as any).tasks.get(t3.id).status = 'DONE';
      (service as any).tasks.get(t4.id).status = 'DONE';

      expect(service.getSummary()).toEqual({ BACKLOG: 1, IN_PROGRESS: 1, DONE: 2 });
    });

    it('returns zero for a status with no tasks', () => {
      const t = service.create({ title: 'Only task' });
      (service as any).tasks.get(t.id).status = 'IN_PROGRESS';
      const summary = service.getSummary();
      expect(summary.BACKLOG).toBe(0);
      expect(summary.DONE).toBe(0);
      expect(summary.IN_PROGRESS).toBe(1);
    });

    // AC-1: each count must be a non-negative integer (not a float or NaN).
    it('AC-1: all counts are non-negative integers', () => {
      service.create({ title: 'A' });
      service.create({ title: 'B' });
      const summary = service.getSummary();
      expect(Number.isInteger(summary.BACKLOG)).toBe(true);
      expect(Number.isInteger(summary.IN_PROGRESS)).toBe(true);
      expect(Number.isInteger(summary.DONE)).toBe(true);
      expect(summary.BACKLOG).toBeGreaterThanOrEqual(0);
      expect(summary.IN_PROGRESS).toBeGreaterThanOrEqual(0);
      expect(summary.DONE).toBeGreaterThanOrEqual(0);
    });

    // AC-3: verbatim example from the spec — 3 BACKLOG tasks → BACKLOG: 3.
    it('AC-3: creating 3 tasks yields BACKLOG: 3, IN_PROGRESS: 0, DONE: 0', () => {
      service.create({ title: 'Task 1' });
      service.create({ title: 'Task 2' });
      service.create({ title: 'Task 3' });
      expect(service.getSummary()).toEqual({ BACKLOG: 3, IN_PROGRESS: 0, DONE: 0 });
    });
  });

  describe('update', () => {
    it('AC-1: updates priority and returns the task with the new priority', () => {
      const task = service.create({ title: 'Update me', priority: 'medium' });
      const updated = service.update(task.id, { priority: 'high' });
      expect(updated.priority).toBe('high');
      expect(updated.id).toBe(task.id);
    });

    it('AC-1: persists the updated priority through findOne', () => {
      const task = service.create({ title: 'Persist check', priority: 'low' });
      service.update(task.id, { priority: 'high' });
      expect(service.findOne(task.id).priority).toBe('high');
    });

    it('AC-1: update with empty dto leaves priority unchanged', () => {
      const task = service.create({ title: 'No change', priority: 'medium' });
      const updated = service.update(task.id, {});
      expect(updated.priority).toBe('medium');
    });

    it('AC-1: throws NotFoundException for an unknown id', () => {
      expect(() => service.update('nonexistent', { priority: 'low' })).toThrow(NotFoundException);
    });

    it('AC-2: rejects an invalid priority value at the DTO boundary', () => {
      const dto = plainToInstance(UpdateTaskDto, { priority: 'urgent' });
      const errors = validateSync(dto);
      expect(errors.some((e) => e.property === 'priority')).toBe(true);
    });

    it('AC-2: accepts all valid priority values', () => {
      for (const priority of ['low', 'medium', 'high'] as const) {
        const dto = plainToInstance(UpdateTaskDto, { priority });
        expect(validateSync(dto)).toHaveLength(0);
      }
    });

    it('AC-2: accepts an empty body (priority is optional)', () => {
      const dto = plainToInstance(UpdateTaskDto, {});
      expect(validateSync(dto)).toHaveLength(0);
    });
  });

  describe('deadline and assignee', () => {
    it('AC1: persists deadline and assignee when provided', () => {
      const task = service.create({
        title: 'With deadline',
        deadline: '2026-12-31T23:59:59.000Z',
        assignee: 'alice',
      });
      expect(task.deadline).toBe('2026-12-31T23:59:59.000Z');
      expect(task.assignee).toBe('alice');
      expect(service.findOne(task.id).deadline).toBe('2026-12-31T23:59:59.000Z');
      expect(service.findOne(task.id).assignee).toBe('alice');
    });

    it('AC2: deadline and assignee default to null when omitted', () => {
      const task = service.create({ title: 'No deadline or assignee' });
      expect(task.deadline).toBeNull();
      expect(task.assignee).toBeNull();
    });
  });
});
