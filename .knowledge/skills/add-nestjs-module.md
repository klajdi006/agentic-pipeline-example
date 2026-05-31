# Skill: Add a NestJS feature module

Reusable procedure the Implementer agent follows for any new backend feature.

## Steps

1. Create `src/<feature>/` with:
   - `<feature>.module.ts` — declares controller + service, imports `TypeOrmModule.forFeature([...])`.
   - `<feature>.controller.ts` — thin; one route per use case; DTO-validated input.
   - `<feature>.service.ts` — business logic; injected repositories.
   - `dto/` — `Create*Dto`, `Update*Dto` with `class-validator` decorators.
   - `entities/<feature>.entity.ts` — TypeORM entity, UTC `timestamptz` for dates.
2. Register the module in `app.module.ts` `imports`.
3. Generate a migration: `npm run migration:generate -- src/migrations/Add<Feature>`.
4. Add the request/response contract to `libs/shared-types/`.
5. Write `*.service.spec.ts` (unit) and `*.e2e-spec.ts` (controller).

## Guardrails

- Never enable `synchronize`. Always hand-review the generated migration.
- Validate every external input. Throw `HttpException` subclasses on error.
