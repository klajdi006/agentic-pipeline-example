The backend slice of TASK-142 is **already fully implemented** in the working tree, and I've verified it builds clean and all tests pass. No further changes were needed. Here's how the four backend steps map to the code and acceptance criteria:

**Step 1 — `task.model.ts` (AC-6)**
- `TaskPriority` declared as a `const` object + matching union type (`'low' | 'medium' | 'high'`), so it works both as a runtime value for `@IsEnum` and as a type. Exported for the DTO to reuse.
- `priority: TaskPriority` added to the `Task` interface, so every persisted/returned task carries a bounded priority.

**Step 2 — `dto/create-task.dto.ts` (AC-3)**
- `priority?: TaskPriority` with `@IsOptional()` + `@IsEnum(TaskPriority)`, importing `TaskPriority` from the model. Out-of-range values like `"urgent"` are rejected at the boundary.

**Step 3 — `tasks.service.ts` (AC-1, AC-2, AC-4, AC-5, AC-6)**
- `create()` defaults `priority` to `TaskPriority.medium` when omitted, otherwise persists the supplied value.
- `findAll()` orders high → medium → low via a fixed `PRIORITY_RANK` map, with a stable insertion-order tiebreaker (decorate-with-index, then sort).

**Step 4 — `tasks.service.spec.ts` (AC-1–AC-5)**
- Tests cover: default `medium`, explicit `high` persisted/round-tripped, ordering high→medium→low, stable tiebreaker for equal priorities, and DTO-boundary rejection of an invalid value (`validateSync`).

**Verification**
- `npm run build` — green (no type errors).
- `npm test` — 10/10 passing, including all 6 priority tests.

The frontend and shared slices in the plan are outside the NestJS backend scope you specified, so I left them untouched. The diff is 4 files, +100/−3, confined to `src/tasks/`.