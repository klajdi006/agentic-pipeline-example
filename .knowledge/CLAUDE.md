# Coding Standards — TaskApp (Angular + NestJS)

> This is a **living document**. The Curator agent proposes updates to it from human
> review feedback after every merged PR. Every agent reads it before acting.

## Architecture

- **Backend:** NestJS, modular. One feature = one module (`src/<feature>/`) with
  `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, `entities/`.
- **Frontend:** Angular standalone components, signals for state, typed reactive forms.
- **Storage:** the reference app uses an in-memory repository (`apps/taskapp/backend`) to stay dependency-free; production would use TypeORM + Postgres with migrations. While in-memory, there is no migration step.
- **Shared types:** request/response contracts live in `libs/shared-types/` and are imported by both FE and BE.

## Backend conventions

- Controllers are thin; business logic lives in services.
- All input is validated with `class-validator` DTOs. No untyped `any` on a boundary.
- Errors throw Nest `HttpException` subclasses; never return raw error strings.
- Times are stored/returned as UTC ISO-8601 strings (`new Date().toISOString()`). Never store local time.
- Background work uses `@nestjs/schedule` (cron) — see [decision 0001](decisions/0001-scheduler-uses-cron.md).

## Frontend conventions

- Components are standalone and `OnPush`.
- State via `signal()` / `computed()`; no `BehaviorSubject` for new code.
- API access only through typed services in `core/api/`. Components never call `HttpClient` directly.
- Dates rendered in the user's timezone via the `TzDatePipe`.

## Testing

- BE: Jest unit tests for services; e2e (`*.e2e-spec.ts`) for controllers via supertest.
- FE: component tests with Testing Library; Playwright for cross-cutting e2e.
- Every PR must keep coverage ≥ 80% on changed files and add tests for new behavior.

## Definition of done

- [ ] Acceptance criteria in the ticket are all met and verified by tests.
- [ ] Migration included for any persistent schema change (N/A while storage is in-memory).
- [ ] No new lint/type errors; build green.
- [ ] PR description links the ticket and lists the changes.
