import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PriorityResponse } from '@taskapp/shared-types';
import { PrioritiesApiService } from '../../core/api/priorities.service';
import { TzDatePipe } from '../../shared/tz-date.pipe';
import { removePriorityById } from './priority.logic';

@Component({
  selector: 'app-priority-list',
  standalone: true,
  imports: [CommonModule, RouterLink, TzDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>Priorities</h2>
    <a routerLink="/priorities/new">New priority</a>
    <ul>
      <li *ngFor="let p of priorities()">
        <a [routerLink]="['/priorities', p.id]">{{ p.name }}</a>
        — level {{ p.level }}
        <small>({{ p.createdAt | tzDate }})</small>
        <button type="button" (click)="remove(p.id)">Delete</button>
      </li>
    </ul>
    <p *ngIf="priorities().length === 0">No priorities yet.</p>
  `,
})
export class PriorityListComponent implements OnInit {
  private readonly api = inject(PrioritiesApiService);
  readonly priorities = signal<PriorityResponse[]>([]);

  ngOnInit(): void {
    this.load();
  }

  remove(id: string): void {
    this.api.remove(id).subscribe(() => {
      this.priorities.update((list) => removePriorityById(list, id));
    });
  }

  private load(): void {
    this.api.list().subscribe((priorities) => this.priorities.set(priorities));
  }
}
