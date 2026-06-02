import { Task } from '../../shared/task.model';
import {
  TASK_TITLE_MAX_LENGTH,
  isTask,
  isUtcIso8601,
  markCompleted,
  removeTaskById,
  validateCreateTask,
} from './task.logic';

/**
 * Direct unit spec for the framework-free tasks client logic. Documents that the
 * client-side rules stay aligned with the backend task contract across the TASK-142
 * acceptance criteria, so the Angular v21 control-flow / signals migration cannot
 * silently drift from the wire format the UI depends on.
 *
 * Each AC is verified here from the client's perspective; the matching backend AC lives
 * in `backend/src/tasks/tasks.controller.spec.ts`.
 */
describe('task.logic (TASK-142 contract)', () => {
  // AC-1 — the create response shape: id, title, completed=false, UTC ISO createdAt.
  describe('AC-1: create response shape', () => {
    const created: Task = {
      id: 'b3f1',
      title: 'Write the report',
      completed: false,
      priority: 'medium',
      createdAt: '2026-05-31T10:00:00.000Z',
    };

    it('recognises a freshly created task (id, title, completed=false, UTC ISO createdAt)', () => {
      expect(isTask(created)).toBe(true);
      expect(created.completed).toBe(false);
      expect(isUtcIso8601(created.createdAt)).toBe(true);
    });

    it('rejects a payload whose createdAt is not a valid UTC ISO-8601 string', () => {
      expect(isTask({ ...created, createdAt: 'not-a-date' })).toBe(false);
      // A non-UTC / non-round-tripping offset is also rejected.
      expect(isUtcIso8601('2026-05-31T10:00:00+02:00')).toBe(false);
    });
  });

  // AC-2 — the list response: an array whose items all match the Task shape.
  describe('AC-2: list response shape', () => {
    const list: Task[] = [
      { id: 'a', title: 'First', completed: false, priority: 'low', createdAt: '2026-05-31T10:00:00.000Z' },
      { id: 'b', title: 'Second', completed: true, priority: 'high', createdAt: '2026-05-31T11:00:00.000Z' },
    ];

    it('accepts an array whose every item matches the Task shape', () => {
      expect(Array.isArray(list)).toBe(true);
      expect(list.every(isTask)).toBe(true);
    });

    it('rejects the list if any item is missing a contract field', () => {
      const bad = [...list, { id: 'c', title: 'No completed flag', createdAt: '2026-05-31T12:00:00.000Z' }];
      expect(bad.every(isTask)).toBe(false);
    });
  });

  // AC-3 — completing a task flips completed to true without touching other fields.
  describe('AC-3: mark complete', () => {
    const task: Task = {
      id: '1',
      title: 'Complete me',
      completed: false,
      priority: 'medium',
      createdAt: '2026-05-31T10:00:00.000Z',
    };

    it('returns a task with completed=true and preserves the other fields', () => {
      expect(markCompleted(task)).toEqual({ ...task, completed: true });
    });

    it('does not mutate the input task', () => {
      markCompleted(task);
      expect(task.completed).toBe(false);
    });
  });

  // AC-4 — deleting a task removes it locally; unknown ids are a no-op.
  describe('AC-4: remove by id', () => {
    const list: Task[] = [
      { id: 'a', title: 'A', completed: false, priority: 'low', createdAt: '2026-05-31T10:00:00.000Z' },
      { id: 'b', title: 'B', completed: false, priority: 'high', createdAt: '2026-05-31T11:00:00.000Z' },
    ];

    it('drops the matching id and keeps the rest', () => {
      expect(removeTaskById(list, 'a').map((t) => t.id)).toEqual(['b']);
    });

    it('is a no-op for an unknown id and never mutates the input', () => {
      expect(removeTaskById(list, 'zzz')).toEqual(list);
      expect(list.map((t) => t.id)).toEqual(['a', 'b']);
    });
  });

  // AC-5 — create input validation mirrors CreateTaskDto (title required, non-empty, ≤200).
  describe('AC-5: create input validation (mirrors CreateTaskDto)', () => {
    it('accepts a valid title', () => {
      expect(validateCreateTask({ title: 'Write the report' })).toEqual([]);
    });

    it('rejects a missing title', () => {
      expect(validateCreateTask({})).not.toEqual([]);
    });

    it('rejects an empty / whitespace-only title', () => {
      expect(validateCreateTask({ title: '' })).not.toEqual([]);
      expect(validateCreateTask({ title: '   ' })).not.toEqual([]);
    });

    it('rejects a non-string title', () => {
      expect(validateCreateTask({ title: 123 })).not.toEqual([]);
    });

    it('accepts a title at the max-length boundary and rejects one past it', () => {
      expect(validateCreateTask({ title: 'x'.repeat(TASK_TITLE_MAX_LENGTH) })).toEqual([]);
      expect(validateCreateTask({ title: 'x'.repeat(TASK_TITLE_MAX_LENGTH + 1) })).not.toEqual([]);
    });
  });
});
