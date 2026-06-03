import { Task, TaskPriority, TaskStatus } from './task.model';
import { tasksToCsv } from './csv.utils';

const BOM = '﻿';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-id',
    title: 'Test task',
    name: null,
    priority: TaskPriority.medium,
    status: TaskStatus.BACKLOG,
    completed: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    description: null,
    deadline: null,
    assignee: null,
    ...overrides,
  };
}

describe('tasksToCsv', () => {
  it('output starts with UTF-8 BOM', () => {
    expect(tasksToCsv([]).startsWith(BOM)).toBe(true);
  });

  it('first non-BOM line is the exact header row', () => {
    const lines = tasksToCsv([]).replace(BOM, '').split('\n');
    expect(lines[0]).toBe('id,title,priority,completed,createdAt,description,deadline,assignee');
  });

  it('empty input produces only the header (one line after BOM)', () => {
    const lines = tasksToCsv([]).replace(BOM, '').split('\n');
    expect(lines).toHaveLength(1);
  });

  it('N tasks produce N+1 lines', () => {
    const tasks = [makeTask({ id: '1' }), makeTask({ id: '2' }), makeTask({ id: '3' })];
    const lines = tasksToCsv(tasks).replace(BOM, '').split('\n');
    expect(lines).toHaveLength(tasks.length + 1);
  });

  it('data rows contain correct field values (null description → empty cell)', () => {
    const task = makeTask({
      id: 'abc-123',
      title: 'Hello world',
      priority: TaskPriority.high,
      completed: true,
      createdAt: '2024-06-01T12:00:00.000Z',
    });
    const lines = tasksToCsv([task]).replace(BOM, '').split('\n');
    expect(lines[1]).toBe('abc-123,Hello world,high,true,2024-06-01T12:00:00.000Z,,,');
  });

  // TASK-142 AC-3 — description column with a non-null value.
  it('TASK-142 AC-3: description cell contains the task description when non-null', () => {
    const task = makeTask({ description: 'Extra details here' });
    const lines = tasksToCsv([task]).replace(BOM, '').split('\n');
    const descCell = lines[1].split(',')[5];
    expect(descCell).toBe('Extra details here');
  });

  // TASK-142 AC-3 — description injection sanitisation mirrors title sanitisation.
  describe('TASK-142 AC-3: description CSV-injection sanitisation', () => {
    it.each(['=', '+', '-', '@'])(
      'description starting with "%s" is prefixed with a single quote',
      (char) => {
        const task = makeTask({ description: `${char}FORMULA` });
        const lines = tasksToCsv([task]).replace(BOM, '').split('\n');
        const descCell = lines[1].split(',')[5];
        expect(descCell).toBe(`'${char}FORMULA`);
      },
    );

    it('description not starting with an injection character is not prefixed', () => {
      const task = makeTask({ description: 'Normal description' });
      const lines = tasksToCsv([task]).replace(BOM, '').split('\n');
      const descCell = lines[1].split(',')[5];
      expect(descCell).toBe('Normal description');
    });
  });

  describe('CSV injection sanitisation', () => {
    it.each(['=', '+', '-', '@'])(
      'title starting with "%s" is prefixed with a single quote',
      (char) => {
        const task = makeTask({ title: `${char}DANGEROUS` });
        const lines = tasksToCsv([task]).replace(BOM, '').split('\n');
        const titleCell = lines[1].split(',')[1];
        expect(titleCell).toBe(`'${char}DANGEROUS`);
      },
    );

    it('title not starting with an injection character is not prefixed', () => {
      const task = makeTask({ title: 'Normal title' });
      const lines = tasksToCsv([task]).replace(BOM, '').split('\n');
      const titleCell = lines[1].split(',')[1];
      expect(titleCell).toBe('Normal title');
    });
  });

  it('title containing a comma is wrapped in double quotes', () => {
    const task = makeTask({ title: 'hello, world' });
    const csv = tasksToCsv([task]).replace(BOM, '');
    expect(csv).toContain('"hello, world"');
  });
});
