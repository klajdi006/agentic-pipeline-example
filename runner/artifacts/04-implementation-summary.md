All tests green — 47 backend + 52 frontend = 99 passing. Here's a summary of every change made:

**Shared types (`libs/shared-types/src/`):**
- `pagination.contract.ts` *(new)* — `PaginatedResponse<T>` generic interface
- `task.contract.ts` *(new)* — `TaskPriority`, `TaskResponse`, `PaginatedTasksResponse`
- `index.ts` — exports the two new contracts

**Backend (`apps/taskapp/backend/src/tasks/`):**
- `dto/pagination-query.dto.ts` *(new)* — `PaginationQueryDto` with `page` (min 1, default 1) and `limit` (min 1, max 100, default 20), both `@Type(() => Number)` so the global `transform: true` pipe coerces strings from query params
- `tasks.service.ts` — `findAll(page, limit)` now returns `{ items, total, page, limit }` sliced from the priority-sorted store
- `tasks.controller.ts` — `GET /tasks` accepts `@Query() PaginationQueryDto` and passes through to the service
- `tasks.service.spec.ts` — existing `.findAll()` call sites updated to `.findAll().items`; new `pagination` describe block covers defaults, custom slicing, over-range page, and full-store total
- `tasks.controller.spec.ts` — updated AC-1/AC-2/AC-5 assertions to work with the paginated response shape
- `tasks.controller.e2e-spec.ts` *(new)* — full HTTP e2e tests using NestJS TestingModule + Node fetch (no supertest): empty store, validation errors (limit=101, page=0, limit=0), and seeded pagination (page=2&limit=10)
- `package.json` jest regex — extended to `.*\.(spec|e2e-spec)\.ts$` so the e2e file is picked up

**Frontend (`apps/taskapp/frontend/src/app/`):**
- `shared/task.model.ts` — re-exports `TaskResponse as Task`, `TaskPriority`, and `PaginatedTasksResponse` from `@taskapp/shared-types`; adds `priority` field to the frontend task type
- `core/api/tasks.service.ts` — `list(page, limit)` returns `Observable<PaginatedTasksResponse>`; `baseUrl` exposed as a `readonly` property for `httpResource()` in the component
- `features/tasks/task-list.component.ts` — replaced `OnInit` + manual subscribe with `httpResource()` keyed on `page` and `limit` signals; both bound from URL query params via `withComponentInputBinding()`; `hasPrev`/`hasNext` computed signals; `goNext()`/`goPrev()` navigate via `Router`; template moved to separate file
- `features/tasks/task-list.component.html` *(new)* — `@if` loading state, `@for` task rows with `track task.id`, Previous/Next buttons disabled at boundaries
- `features/tasks/task-list.component.spec.ts` *(new)* — pure-function pagination logic tests (hasPrev, hasNext, page increment/decrement, loading guard)
- `features/tasks/task.logic.ts` — `isTask()` now also validates `priority` ∈ `{low,medium,high}`
- `features/tasks/task.logic.spec.ts` — all `Task` literals updated to include `priority`
- `app.routes.ts` — `/tasks` route added (lazy `loadComponent`); default redirect changed from `/priorities` to `/tasks`
- `app.component.ts` — removed embedded `<app-task-list>`; added Tasks nav link; tasks are now purely routed