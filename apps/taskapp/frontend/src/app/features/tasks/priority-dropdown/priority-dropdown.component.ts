import { ChangeDetectionStrategy, Component, output, input } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { TaskPriority } from '../../../shared/task.model';

@Component({
  selector: 'app-priority-dropdown',
  templateUrl: './priority-dropdown.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class PriorityDropdownComponent {
  readonly taskId = input.required<string>();
  readonly initialPriority = input<TaskPriority>('medium');
  readonly priorityChanged = output<{ id: string; priority: TaskPriority }>();

  readonly priorities: TaskPriority[] = ['high', 'medium', 'low'];

  readonly priority$ = new BehaviorSubject<TaskPriority>('medium');

  ngOnInit(): void {
    this.priority$.next(this.initialPriority());
  }

  onChange(value: string): void {
    const priority = value as TaskPriority;
    this.priority$.next(priority);
    this.priorityChanged.emit({ id: this.taskId(), priority });
  }
}
