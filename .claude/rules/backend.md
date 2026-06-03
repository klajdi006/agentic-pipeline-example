# Backend Conventions — NestJS

When editing `apps/taskapp/backend/**`, follow these patterns strictly.

## Module Structure

- One feature = one module (`src/<feature>/`) with:
  - `<feature>.module.ts` — module definition
  - `<feature>.controller.ts` — HTTP endpoints
  - `<feature>.service.ts` — business logic
  - `dto/` — request/response DTOs
  - `entities/` — data model (if using TypeORM/Prisma)

Controllers are thin; all business logic lives in services.

## Input Validation & Boundaries

- **All input is validated** with `class-validator` DTOs. Never accept untyped `any` on a boundary.
- Controllers always validate incoming requests via DTOs before passing to services.
- Use `@IsNotEmpty()`, `@IsEmail()`, `@IsString()`, etc. as appropriate.

## Error Handling

- Errors throw Nest `HttpException` subclasses (or `BadRequestException`, `NotFoundException`, etc.).
- Never return raw error strings or unstructured responses.
- Exceptions automatically serialize to proper HTTP status codes (400, 404, 500, etc.).

## Time & Date Handling

- **Times are stored and returned as UTC ISO-8601 strings** (`new Date().toISOString()`).
- Never store local time; never mix timezones.
- When reading user input, assume UTC unless the schema explicitly says otherwise.

## Background Work

- Use `@nestjs/schedule` with cron decorators (`@Cron()`) for scheduled tasks.
- See [decision 0001](../../.knowledge/decisions/0001-scheduler-uses-cron.md) for rationale.

## Database Queries

- **No N+1 queries**: when fetching relational fields, explicitly use a query builder with `leftJoinAndSelect` joins.
- Never lazy-load relationships via array mapping in a loop.
- Eager-load all required relationships in a single query.

## Testing

- Write Jest unit tests for services.
- Write e2e tests (`*.e2e-spec.ts`) for controllers using `supertest`.
- Keep test coverage ≥ 80% on changed files.
