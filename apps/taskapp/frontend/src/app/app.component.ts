import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TaskListComponent } from './features/tasks/task-list.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [TaskListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>TaskApp</h1>
      <app-task-list />
    </main>
  `,
})
export class AppComponent {}
