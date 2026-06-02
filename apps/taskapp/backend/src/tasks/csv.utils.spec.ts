import { Task, TaskPriority } from './task.model';
import { tasksToCsv } from './csv.utils';

const BOM = '﻿';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-id',
    title: 'Test task',
    priority: TaskPriority.medium,
    completed: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('tasksToCsv', () => {
  it('output starts with UTF-8 BOM', () => {
    expect(tasksToCsv([]).startsWith(BOM)).toBe(true);
  });

  it('first non-BOM line is the exact header row', () => {
    const lines = tasksToCsv([]).replace(BOM, '').split('\n');
    expect(lines[0]).toBe('id,title,priority,completed,createdAt');
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

  it('data rows contain correct field values', () => {
    const task = makeTask({
      id: 'abc-123',
      title: 'Hello world',
      priority: TaskPriority.high,
      completed: true,
      createdAt: '2024-06-01T12:00:00.000Z',
    });
    const lines = tasksToCsv([task]).replace(BOM, '').split('\n');
    expect(lines[1]).toBe('abc-123,Hello world,high,true,2024-06-01T12:00:00.000Z');
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
