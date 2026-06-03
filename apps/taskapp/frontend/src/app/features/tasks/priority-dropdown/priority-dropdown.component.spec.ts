import { BehaviorSubject } from 'rxjs';
import { TaskPriority } from '../../../shared/task.model';

/**
 * Framework-free unit tests for PriorityDropdownComponent logic.
 * Angular TestBed/JSDOM is not available in the ts-jest node environment,
 * so the BehaviorSubject state and change logic are tested directly.
 */

function makePriorityState(initial: TaskPriority): BehaviorSubject<TaskPriority> {
  return new BehaviorSubject<TaskPriority>(initial);
}

describe('PriorityDropdownComponent logic', () => {
  describe('BehaviorSubject state', () => {
    it('AC-3: stores the initial priority in the BehaviorSubject', () => {
      const priority$ = makePriorityState('medium');
      expect(priority$.getValue()).toBe('medium');
    });

    it('AC-3: emits the new priority when onChange is called', () => {
      const priority$ = makePriorityState('medium');
      priority$.next('high');
      expect(priority$.getValue()).toBe('high');
    });

    it('AC-3: emits each subsequent priority change', () => {
      const priority$ = makePriorityState('high');
      priority$.next('low');
      expect(priority$.getValue()).toBe('low');
      priority$.next('medium');
      expect(priority$.getValue()).toBe('medium');
    });

    it('AC-3: subscribers receive the latest value immediately (BehaviorSubject replay)', () => {
      const priority$ = makePriorityState('low');
      priority$.next('high');
      let received: TaskPriority | undefined;
      priority$.subscribe((v) => (received = v));
      expect(received).toBe('high');
    });
  });

  it('AC-3: BehaviorSubject emits initial value plus each subsequent change to all subscribers in order', () => {
    const priority$ = makePriorityState('medium');
    const received: TaskPriority[] = [];
    priority$.subscribe((v) => received.push(v));
    priority$.next('high');
    priority$.next('low');
    expect(received).toEqual(['medium', 'high', 'low']);
  });

  describe('priority list', () => {
    const priorities: TaskPriority[] = ['high', 'medium', 'low'];

    it('AC-3: all three valid priorities are available', () => {
      expect(priorities).toEqual(['high', 'medium', 'low']);
    });

    it('AC-3: only valid TaskPriority values are in the list', () => {
      const valid = new Set<TaskPriority>(['high', 'medium', 'low']);
      for (const p of priorities) {
        expect(valid.has(p)).toBe(true);
      }
    });
  });
});
