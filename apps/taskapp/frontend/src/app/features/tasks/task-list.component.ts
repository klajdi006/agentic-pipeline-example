import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TasksApiService } from '../../core/api/tasks.service';
import { Task } from '../../shared/task.model';

@Component({
  selector: 'app-task-list',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>Tasks</h2>
    <ul>
      <li *ngFor="let t of tasks()">
        {{ t.title }} <small>({{ t.createdAt }})</small>
      </li>
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
