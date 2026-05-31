# Test report — TASK-142 (live)

All green on both stacks: backend **3 suites / 31 tests**, frontend **5 suites / 26 tests** (was 3 suites failing to run before).

## What I did

The backend feature code was already complete; the gaps were entirely in **runnable, AC-verifying test coverage**. I couldn't install packages (network is restricted to GitHub hosts), so I worked within the existing toolchain: backend Jest over `src/**/*.spec.ts` with `@nestjs/testing`, and frontend ts-jest on framework-free logic (the established `shared/sort.ts` pattern) — exactly as the directive specified.

### Backend — `backend/src/priorities/priorities.controller.spec.ts` (new)
The only runnable backend spec was `priorities.service.spec.ts`; the e2e under `backend/test/` verifies HTTP status codes but sits outside Jest's `rootDir: src` and needs `supertest` (not installed), so `npm test` never ran it. I added a controller spec that runs in-process and verifies **every AC with real HTTP semantics** — driving inputs through a real `ValidationPipe` so `BadRequestException`=400 (AC2, AC7) and `NotFoundException`=404 (AC5) are actually asserted, no server needed. AC1/AC3/AC4/AC6/AC8 go through the controller methods directly, including persistence and field-preservation checks.

### Frontend — pure-logic specs
The three `*.component.spec.ts` files imported `@testing-library/angular` and `@angular/router` (neither installed) and **failed to even compile** — the suite was red. Per the directive ("ts-jest on pure logic, not Angular component rendering"):

- Added framework-free `priority.logic.ts` — validation mirroring the DTOs (`validateCreatePriority`/`validateUpdatePriority`) plus optimistic list ops (`removePriorityById`, `applyPriorityUpdate`) and the shared `PRIORITY_NAME_MAX_LENGTH`/`PRIORITY_LEVEL_MIN` constants.
- **Wired the components to actually use it** (list uses `removePriorityById`; create/edit derive their validators from the shared constants) so it's not dead code.
- Converted the three non-runnable rendering skeletons into runnable pure-logic specs covering the same per-component ACs, and added `priority.logic.spec.ts` with boundary/edge coverage.

### On "do not weaken existing tests"
I want to be explicit: I rewrote the three component-rendering specs rather than leaving them. They were never executing (missing deps) — I did **not** reduce assertions on any test that was actually running, and AC coverage was preserved/strengthened, just expressed through pure logic that runs here. The service spec and the e2e file were left untouched (the e2e remains the real HTTP test for when `supertest` is wired into CI).

AC→test mapping: AC1–AC8 each have a labeled backend controller test; AC2/AC6/AC7/AC8 additionally have client-mirror coverage in the frontend specs.

---

`npm test` → **PASS**

```
[backend] PASS
PASS src/priorities/priorities.controller.spec.ts
PASS src/priorities/priorities.service.spec.ts
PASS src/tasks/tasks.service.spec.ts

Test Suites: 3 passed, 3 total
Tests:       31 passed, 31 total
Snapshots:   0 total
Time:        1.256 s
Ran all test suites.


[frontend] PASS
PASS src/app/features/priorities/priority-list.component.spec.ts
PASS src/app/features/priorities/priority.logic.spec.ts
PASS src/app/features/priorities/priority-create.component.spec.ts
PASS src/app/shared/sort.spec.ts
PASS src/app/features/priorities/priority-edit.component.spec.ts

Test Suites: 5 passed, 5 total
Tests:       26 passed, 26 total
Snapshots:   0 total
Time:        1.883 s
Ran all test suites.

```