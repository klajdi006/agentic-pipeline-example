This is a read-only research deliverable (the impact assessment), not an implementation plan to approve — so per the tool's own guidance I'll present it directly rather than calling ExitPlanMode.

## Impact Assessment — Add Task Priorities

Full write-up: `/Users/klajdi/.claude/plans/feature-request-add-task-peppy-stonebraker.md`

**Affected surfaces**

- **Backend** (`apps/taskapp/backend/src/tasks/`): `task.model.ts` (add `priority` to `Task`), `dto/create-task.dto.ts` (validated `priority`, `@IsEnum`), `tasks.service.ts` (persist + default + optional priority ordering), `tasks.service.spec.ts` (new cases). Controller unchanged unless an edit/sort/filter route is added.
- **Frontend** (`apps/taskapp/frontend/src/app/`): `shared/task.model.ts`, `core/api/tasks.service.ts` (`create()` currently takes only `title`), `features/tasks/task-list.component.ts` (render/sort). No create/edit form exists today.
- **Shared:** define `TaskPriority` + `Task` once.

**New artifacts (scope-dependent)**

- `TaskPriority` enum/union; possibly `libs/shared-types/` + tsconfig path aliases; possibly `UpdateTaskDto` + `PATCH /api/tasks/:id`; possibly an FE reactive form + tests.

**Risks**

- **No migration** — storage is in-memory (N/A now).
- **Required vs optional** `priority` is a contract decision; required ripples through every `create()` caller, optional-with-default is lower blast radius.
- **Existing convention drift:** CLAUDE.md mandates `libs/shared-types/`, `TzDatePipe`, typed reactive forms, Testing Library, and BE e2e specs — **none currently exist** in the app. "Building to spec" risks pulling that whole stack into this ticket; the spec should scope conventions-vs-reality explicitly.
- `findAll()` returns insertion order today; a priority sort needs a defined tiebreaker.

**Open questions for the spec**

1. Allowed values & default (`low/medium/high`, default `medium`?); required or optional?
2. Editable after creation (needs update DTO + PATCH route — none today)?
3. Just display priority, or sort/filter by it?
4. Stand up `libs/shared-types/` now, or keep the existing duplicated-model pattern?
5. Build a create/edit form (none exists) or only render on the read-only list?
6. Apply CLAUDE.md conventions (TzDatePipe, typed forms, FE/e2e tests) as part of this, or out of scope?

These are left open by design — as Scout I'm flagging them for the spec rather than deciding them. Let me know if you'd like me to resolve any of them or hand off to the spec/implementation step.