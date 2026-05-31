# Skill: Add an Angular feature

Reusable procedure the Implementer agent follows for any new frontend feature.

> **Target: Angular v21.** Standalone APIs only, signals for state, separate template/style
> files (no inline), `inject()` for DI, and the built-in control-flow blocks. No NgModules,
> no `*ngIf`/`*ngFor`, no `CommonModule` for control flow, no decorator `@Input()`/`@Output()`.

## Steps

1. **Create the component folder** under `src/app/features/<feature>/`, with separate files:
   - `<name>.ts` — the component class
   - `<name>.html` — the template (`templateUrl`)
   - `<name>.css` (or `.scss`) — styles, **only if needed** (`styleUrl`)
   - `<name>.spec.ts` — the test
   Do **not** inline `template:` or `styles:`. Match the repo's existing file-naming convention.
2. **Standalone + OnPush.** Every component is standalone (the v21 default — omit the redundant
   `standalone: true`, never create an NgModule) and sets `changeDetection: ChangeDetectionStrategy.OnPush`.
3. **State with signals.** Hold view state in `signal()`; derive with `computed()`; use
   `effect()` only for genuine side-effects (not to sync state). Reach for `linkedSignal()` when
   a derived value must also be writable. No `BehaviorSubject` for component state.
4. **Inputs/outputs are signal-based.** Use `input()` / `input.required()` / `model()` and
   `output()` — never the `@Input()` / `@Output()` decorators. Use `viewChild()` / `contentChild()`
   (signal queries) instead of `@ViewChild`.
5. **DI via `inject()`.** Inject services with `inject(MyService)` in field initializers, not via
   constructor parameters.
6. **Typed API service.** Add a typed service in `core/api/<feature>.service.ts` that returns the
   shared-types contracts from `libs/shared-types`. Components never touch `HttpClient` directly.
7. **Load data without manual subscribe.** Prefer `httpResource()` / `resource()` for async reads,
   or `toSignal()` to bridge an Observable into a signal. If you must subscribe, use
   `takeUntilDestroyed()` — never a hand-rolled `ngOnDestroy` unsubscribe.
8. **Typed reactive forms.** Build forms with `NonNullableFormBuilder` (or `fb.nonNullable`) so
   controls are strongly typed and non-nullable. Mirror the backend DTO's validators with
   `Validators.*`. No template-driven forms for anything non-trivial.
9. **Templates use control-flow blocks** — `@if` / `@else`, `@for` (always with `track`),
   `@switch`. Use `@defer` to lazily load heavy or below-the-fold content.
10. **Route it** with a lazy `loadComponent` and `provideRouter(withComponentInputBinding())` so
    route params bind straight into signal `input()`s. Add a nav entry if user-facing.
11. **Render dates** with `TzDatePipe` (user timezone) — never raw `Date` formatting.
12. **Test** the feature's logic with a spec (pure helpers are unit-tested directly; components via
    Testing Library / `TestBed`), covering each acceptance criterion.

## Conventions at a glance

| Area | Use | Avoid |
|------|-----|-------|
| Component | standalone, `OnPush`, separate `.ts`/`.html`/`.css` | NgModules, inline `template`/`styles` |
| State | `signal`, `computed`, `linkedSignal` | `BehaviorSubject`, mutable fields |
| I/O | `input()`, `input.required()`, `model()`, `output()` | `@Input()`, `@Output()` |
| Queries | `viewChild()`, `contentChild()` | `@ViewChild`, `@ContentChild` |
| DI | `inject()` | constructor injection |
| Async | `httpResource()`, `resource()`, `toSignal()` | manual `subscribe` + `ngOnDestroy` |
| Forms | typed reactive forms via `NonNullableFormBuilder` | template-driven, untyped `FormControl` |
| Template | `@if`/`@for`(+`track`)/`@switch`, `@defer` | `*ngIf`/`*ngFor`, `ngSwitch`, `CommonModule` |
| DI providers | `provideHttpClient`, `provideRouter`, functional guards/interceptors | provider arrays in NgModules |

## Guardrails

- Components are **standalone** and never injected with `HttpClient` directly — only via a typed `core/api/` service.
- Every component sets `ChangeDetectionStrategy.OnPush`.
- **Separate files only** — no inline templates or styles; create a `.css`/`.scss` file only when the component actually has styles.
- State via `signal()` / `computed()`; inputs/outputs via `input()` / `output()` / `model()`.
- Templates use `@if` / `@for` / `@switch` — never `*ngIf` / `*ngFor`, and don't import `CommonModule` for control flow.
- Strongly-typed reactive forms; no untyped or template-driven forms for real features.
- Prefer signal-based data loading; if subscribing, always `takeUntilDestroyed()`.
