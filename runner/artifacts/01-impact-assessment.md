---

## Impact Assessment: Server-Side Paginated Task List

### Affected Surfaces

#### Backend (`apps/taskapp/backend/src/tasks/`)

| File | Change |
|---|---|
| `tasks.controller.ts` | Accept `page` / `limit` query params; return `PaginatedResponse<Task>` instead of `Task[]` |
| `tasks.service.ts` | Slice the sorted array after `findAll()` sort; return `{ items, total }` |
| `dto/` (new) | `PaginationQueryDto` — `@IsInt @Min(1) page`, `@IsInt @Min(1) @Max(100) limit` with defaults |

#### Shared Types (`libs/shared-types/src/`)

| File | Change |
|---|---|
| `task.contract.ts` (new) | `TaskResponse`, `PaginatedTasksResponse` interfaces; export from `index.ts` |
| `pagination.contract.ts` (new, optional) | Generic `PaginatedResponse<T> { items: T[]; total: number; page: number; limit: number }` — reusable for priorities later |

> **Note:** The frontend `shared/task.model.ts` and backend `task.model.ts` are currently diverged — FE model omits `priority`. Unifying through shared-types now avoids a future bug.

#### Frontend (`apps/taskapp/frontend/src/app/`)

| File | Change |
|---|---|
| `core/api/tasks.service.ts` | `list(page, limit)` → `Observable<PaginatedTasksResponse>` |
| `features/tasks/task-list.component.ts` | Add `page` / `pageSize` signals; drive reload via `resource()` or `httpResource()`; pagination controls in template |
| `features/tasks/task-list.component.html` | Prev / Next buttons (or page-number row); loading state |

### New Artifacts

- `backend/src/tasks/dto/pagination-query.dto.ts`
- `libs/shared-types/src/task.contract.ts`
- `libs/shared-types/src/pagination.contract.ts` *(optional but reusable)*
- `features/tasks/task-list.component.html` *(currently missing — component uses templateUrl but no `.html` exists)*

### Risks

| Risk | Severity | Notes |
|---|---|---|
| **Sort-then-slice is stateless** | Medium | In-memory store re-sorts the full array on every request; deterministic only if no concurrent writes change ordering mid-page. Acceptable at current scale. |
| **FE model divergence** | Medium | Frontend `Task` omits `priority`; adding paginated response is a good forcing function to unify via shared-types, but it touches `task.logic.ts` and all task-related tests. |
| **`TaskListComponent` uses `ngOnInit` + subscribe** | Low | Violates the project's `httpResource()` / `toSignal()` convention. A page-driven reload fits naturally with `resource()` — refactor is small but should happen here. |
| **No route for task list** | Low | `app.routes.ts` has no `/tasks` route; the component is embedded directly in `AppComponent`. Pagination state (current page) won't survive navigation. Decide: query params vs. signal-local state. |
| **Test coverage** | Low | `TasksService` and `TasksController` need updated/new specs for paginated behavior; no FE component tests currently exist for `TaskListComponent`. |

### Open Questions

1. **Page size** — what default and maximum? Suggest `limit=20, max=100`.
2. **Pagination UI style** — numbered pages, prev/next only, or infinite scroll?
3. **Persist page in URL?** — query params (`?page=2&limit=20`) survive refresh/share; signal-local state does not. Signals bind cleanly to route params with `withComponentInputBinding()`.
4. **Sort order** — current sort is priority-rank only. Should the paginated API expose a `sortBy` / `sortDir` parameter, or lock it to the existing priority sort?
5. **Task contract migration** — unify the FE/BE `Task` models into `libs/shared-types/task.contract.ts` as part of this ticket, or track separately?