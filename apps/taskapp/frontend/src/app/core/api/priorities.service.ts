import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CreatePriorityRequest,
  PriorityResponse,
  UpdatePriorityRequest,
} from '@taskapp/shared-types';

/**
 * Typed access to the priorities API. Components consume this service rather than
 * injecting `HttpClient` directly (see CLAUDE.md).
 */
@Injectable({ providedIn: 'root' })
export class PrioritiesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/priorities';

  list(): Observable<PriorityResponse[]> {
    return this.http.get<PriorityResponse[]>(this.base);
  }

  get(id: string): Observable<PriorityResponse> {
    return this.http.get<PriorityResponse>(`${this.base}/${id}`);
  }

  create(body: CreatePriorityRequest): Observable<PriorityResponse> {
    return this.http.post<PriorityResponse>(this.base, body);
  }

  update(id: string, body: UpdatePriorityRequest): Observable<PriorityResponse> {
    return this.http.patch<PriorityResponse>(`${this.base}/${id}`, body);
  }

  remove(id: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`${this.base}/${id}`);
  }
}
