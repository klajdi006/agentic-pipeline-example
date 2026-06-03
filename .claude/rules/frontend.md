# Frontend Conventions — Angular v21

When editing `apps/taskapp/frontend/**`, follow these patterns strictly.

## Component Structure & Declaration

- Target **Angular v21**.
- Every component is **standalone** with `standalone: true` in the decorator.
- Every component uses `ChangeDetectionStrategy.OnPush` for optimal performance.
- No legacy NgModules; no `CommonModule` imports for control flow.
- Each component lives in its own subfolder (e.g., `features/tasks/task-list/task-list.component.ts`).
- Components have separate files: `*.component.ts` + `*.component.html` (via `templateUrl`) + optional `*.component.css`/`.scss` (via `styleUrl`).

## State Management

- Use **Angular Signals** for component local state:
  - `signal()` for mutable state
  - `computed()` for derived state
  - Never use `BehaviorSubject` for component state
- Load async data with `httpResource()` / `resource()` / `toSignal()`.
- If you must subscribe, use `takeUntilDestroyed()` to prevent memory leaks.

## Input/Output & Dependency Injection

- Use signal APIs for inputs/outputs:
  - `input()` for optional inputs
  - `input.required()` for required inputs
  - `model()` for two-way binding
  - `output()` for events
- **Never use** `@Input()`, `@Output()`, `@ViewChild`, `@ContentChild` decorators.
- Use signal queries instead: `viewChild()`, `contentChild()`.
- Inject dependencies via `inject()`, not constructor parameters.

## Forms

- Use strongly-typed reactive forms with `NonNullableFormBuilder`.
- Never use template-driven forms for non-trivial features.
- All form groups and controls must have explicit types.

## Templates & Control Flow

- Use **built-in control-flow blocks**:
  - `@if` / `@else` (not `*ngIf`)
  - `@for` with a `track` expression (not `*ngFor`)
  - `@switch` (not `*ngSwitchCase`)
- Never import `CommonModule` for control flow.
- Always include a `track` function in `@for` loops to optimize rendering.

## API Access

- API calls only through typed services in `core/api/`.
- Components never call `HttpClient` directly; always go through an API service.
- API services export signal-based or Observable methods that components wrap with `toSignal()` / `resource()`.

## Date & Time Rendering

- Render dates in the **user's timezone** via the `TzDatePipe`.
- Never render ISO-8601 strings directly to the user.

## Styling

- Use **Tailwind CSS utility classes** directly inline in templates.
- Avoid creating separate `*.component.scss` companion files unless explicitly required.
- Keep styles minimal and composable.

## Testing

- Write component tests with Testing Library.
- Write cross-cutting e2e tests with Playwright.
- Keep test coverage ≥ 80% on changed files.
