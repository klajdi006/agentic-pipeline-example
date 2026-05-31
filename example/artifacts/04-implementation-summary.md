The sandbox blocks writes to `.git`, so I can't create the commit from here (and policy disables overriding the sandbox). All code changes are complete in the working tree and verified green. Here's the summary.

## Implementation summary — TASK-142 (Angular v21 migration)

### Frontend (Angular)

**Step 1 — Angular v21 bump** (`frontend/package.json`)
- `@angular/common|core|forms|platform-browser|router` bumped `^18.2.0` → `^21.0.0`.
- ⚠️ `package-lock.json` still pins the 18.2.14 tree. Regenerating it requires `npm install` against the registry, which the sandbox's network policy blocks — needs to run where npm has network access. No `@angular/cli`/devkit exists in this jest-only skeleton, so there was nothing to `ng update`.

**Step 2 — control-flow migration + drop `CommonModule`**
- `tasks/task-list.component.ts`: `*ngFor` → `@for (...; track t.id)`; `CommonModule` removed.
- `priorities/priority-list.component.ts`: `*ngFor` → `@for (...; track p.id)`, and the `*ngIf="length===0"` empty state → idiomatic `@empty` block; `CommonModule` removed (kept `RouterLink`, `TzDatePipe`).
- `priorities/priority-create.component.ts` & `priority-edit.component.ts`: `*ngIf` error blocks → `@if`; `CommonModule` removed (kept `ReactiveFormsModule`).

**Step 3 — OnPush + signals** — already satisfied everywhere (incl. `app.component.ts`); all view state already uses `signal()`. No HttpClient moved out of `core/api/`. No changes needed.

**Step 4 — specs** (`priority-{list,create,edit}.component.spec.ts`) — refreshed each to map its pure-logic assertions onto the new control-flow branches (e.g. a new test that removing the last priority yields `[]`, driving the `@empty` branch). These stay pure-logic because this skeleton runs ts-jest in node with **no TestBed/jsdom** (documented in `frontend/package.json`) — there's no Angular runtime to render templates against, and the components import `@angular/*` which isn't installed. Faithful rendering assertions aren't possible here; the helpers are the single source of truth the templates mirror.

**Step 5 — standards docs** — `.knowledge/CLAUDE.md` and `.knowledge/skills/add-angular-feature.md` updated to mandate Angular v21, OnPush on every component, signals/computed, and `@if`/`@for`(+`track`)/`@switch` instead of `*ngIf`/`*ngFor`/`CommonModule`. Note: the plan's `apps/taskapp/.knowledge/...` paths don't exist — only the repo-root `.knowledge/` tree does, so I updated those rather than create a duplicate tree.

### Backend (NestJS)

**Step 1 — `backend/test/tasks.e2e-spec.ts`** (new, no production code touched) — mirrors the priorities e2e harness (Nest `Test` + `supertest`, whitelist `ValidationPipe`) and pins the contract: POST 201 `{id,title,completed:false,createdAt UTC ISO}` (AC-1), GET 200 array-of-Task (AC-2), PATCH `/complete` 200 `completed:true` (AC-3), DELETE 200 `{ok:true}` then GET 404 (AC-4), POST empty/missing title 400 + creates-nothing (AC-5).

### Verification
- `npm --prefix backend test` → **31 passed**; `npm --prefix backend run build` → clean.
- `npm --prefix frontend test` → **27 passed**.
- Like the existing `priorities.e2e-spec.ts`, the new e2e lives outside the jest `rootDir` (`src`) and isn't run by `npm test` in this dependency-free skeleton (supertest isn't installed) — it's wired to the standard Nest `jest-e2e` config for CI.

### To commit (blocked here by the `.git` sandbox restriction)
Run from the repo root — stages only TASK-142 files, leaving the pre-existing `example/`, `README.md`, `.env.example` changes untouched:

```bash
git add .knowledge/CLAUDE.md .knowledge/skills/add-angular-feature.md \
  apps/taskapp/frontend/package.json \
  apps/taskapp/frontend/src/app/features/tasks/task-list.component.ts \
  apps/taskapp/frontend/src/app/features/priorities/priority-{list,create,edit}.component.ts \
  apps/taskapp/frontend/src/app/features/priorities/priority-{list,create,edit}.component.spec.ts \
  apps/taskapp/backend/test/tasks.e2e-spec.ts
git commit -m "TASK-142: migrate frontend to Angular v21 control-flow; pin task API contract with e2e"
```

Want me to retry the commit (it needs `.git` write access this sandbox denies), or leave it for you to run?