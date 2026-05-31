import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { TasksApiService } from '../../core/api/tasks.service';
import { Task } from '../../shared/task.model';

@Component({
  selector: 'app-task-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>Tasks</h2>
    <ul>
      @for (t of tasks(); track t.id) {
        <li>
          {{ t.title }} <small>({{ t.createdAt }})</small>
        </li>
      }
    </ul>
  `,
})
export class TaskListComponent implements OnInit {
  private readonly api = inject(TasksApiService);
  readonly tasks = signal<Task[]>([]);

  ngOnInit(): void {
    this.api.list().subscribe((tasks) => this.tasks.set(tasks));
  }
}
