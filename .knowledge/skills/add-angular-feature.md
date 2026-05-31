# Skill: Add an Angular feature

Reusable procedure the Implementer agent follows for any new frontend feature.

> Target Angular **v21**. New code uses the built-in control-flow blocks and signals;
> the legacy `*ngIf`/`*ngFor` structural directives and `CommonModule` are no longer used.

## Steps

1. Create a standalone, `OnPush` component under `src/app/features/<feature>/`.
2. Hold view state in `signal()` / `computed()`; derive, don't store duplicated state.
3. Use built-in control-flow blocks in templates — `@if` / `@else`, `@for` (always with a
   `track` expression), `@switch`. Do **not** import `CommonModule` for control flow.
4. Add a typed service in `core/api/<feature>.service.ts` returning shared-types contracts.
5. Use typed reactive forms; validate on the client to mirror the DTO rules.
6. Render dates with `TzDatePipe` (user timezone).
7. Add a route (lazy `loadComponent`) and a nav entry if user-facing.
8. Component test with Testing Library covering the acceptance criteria.

## Guardrails

- Components never inject `HttpClient` directly — only the typed API service.
- Every component sets `ChangeDetectionStrategy.OnPush`.
- State via `signal()` / `computed()`; no new `BehaviorSubject` for component state.
- Templates use `@if` / `@for` / `@switch` — never `*ngIf` / `*ngFor`.
