# Skill: Add an Angular feature

Reusable procedure the Implementer agent follows for any new frontend feature.

## Steps

1. Create a standalone, `OnPush` component under `src/app/features/<feature>/`.
2. Hold view state in `signal()` / `computed()`; derive, don't store duplicated state.
3. Add a typed service in `core/api/<feature>.service.ts` returning shared-types contracts.
4. Use typed reactive forms; validate on the client to mirror the DTO rules.
5. Render dates with `TzDatePipe` (user timezone).
6. Add a route (lazy `loadComponent`) and a nav entry if user-facing.
7. Component test with Testing Library covering the acceptance criteria.

## Guardrails

- Components never inject `HttpClient` directly — only the typed API service.
- No new `BehaviorSubject` for component state; use signals.
