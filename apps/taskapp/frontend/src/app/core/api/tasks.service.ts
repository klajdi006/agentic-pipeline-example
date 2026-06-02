import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Task, PaginatedTasksResponse } from '../../shared/task.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TasksApiService {
  private readonly http = inject(HttpClient);
  readonly baseUrl = `${environment.apiUrl}/tasks`;

  list(page = 1, limit = 20): Observable<PaginatedTasksResponse> {
    return this.http.get<PaginatedTasksResponse>(this.baseUrl, {
      params: { page, limit },
    });
  }

  create(title: string): Observable<Task> {
    return this.http.post<Task>(this.baseUrl, { title });
  }
}
