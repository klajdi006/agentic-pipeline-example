import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  numberAttribute,
} from '@angular/core';
import { Router } from '@angular/router';
import { httpResource } from '@angular/common/http';
import { PaginatedTasksResponse } from '../../shared/task.model';
import { TasksApiService } from '../../core/api/tasks.service';
import { TzDatePipe } from '../../shared/tz-date.pipe';

@Component({
  selector: 'app-task-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-list.component.html',
  imports: [TzDatePipe],
})
export class TaskListComponent {
  private readonly api = inject(TasksApiService);
  private readonly router = inject(Router);

  /** Bound from the ?page query param via withComponentInputBinding(). */
  readonly page = input(1, { transform: numberAttribute });
  /** Bound from the ?limit query param via withComponentInputBinding(). */
  readonly limit = input(20, { transform: numberAttribute });

  readonly data = httpResource<PaginatedTasksResponse>(() => ({
    url: this.api.baseUrl,
    params: { page: this.page(), limit: this.limit() },
  }));

  readonly hasPrev = computed(() => this.page() > 1);
  readonly hasNext = computed(() => {
    const d = this.data.value();
    return d !== undefined ? this.page() * this.limit() < d.total : false;
  });

  goNext(): void {
    this.router.navigate([], {
      queryParams: { page: this.page() + 1 },
      queryParamsHandling: 'merge',
    });
  }

  goPrev(): void {
    this.router.navigate([], {
      queryParams: { page: Math.max(1, this.page() - 1) },
      queryParamsHandling: 'merge',
    });
  }
}
