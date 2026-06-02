import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>TaskApp</h1>
      <nav>
        <a routerLink="/tasks">Tasks</a>
        <a routerLink="/priorities">Priorities</a>
      </nav>
      <router-outlet />
    </main>
  `,
})
export class AppComponent {}
