import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TaskListComponent } from './features/tasks/task-list.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterOutlet, TaskListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>TaskApp</h1>
      <nav>
        <a routerLink="/priorities">Priorities</a>
      </nav>
      <app-task-list />
      <router-outlet />
    </main>
  `,
})
export class AppComponent {}
