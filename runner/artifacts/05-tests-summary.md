# Test report — TASK-142 (live)

All 57 backend and 55 frontend tests pass. Here's a summary of what was added:

**`tasks.service.spec.ts`** (6 new tests in the `pagination` describe):
- AC-1: 25 tasks, default params → 20 items, total=25
- AC-3: 25 tasks, page=3, limit=10 → 5 items
- AC-4: 25 tasks, page=4, limit=10 → 0 items
- AC-5: empty store → `{ items: [], total: 0, page: 1, limit: 20 }`
- AC-9: mixed priorities → slice preserves high→medium→low order
- AC-10: 5 tasks, limit=100 → all 5 items returned

**`tasks.controller.e2e-spec.ts`** (4 new tests + store-reset infrastructure):
- Added `TasksService` reference via `app.get()` with `afterAll` store cleanup between blocks
- AC-3: `GET /tasks?page=3&limit=10` → 5 items
- AC-4: `GET /tasks?page=4&limit=10` → empty items, total=25
- AC-9: new describe seeding 3 mixed-priority tasks, verifies `['high','medium','low']` order
- AC-10: new describe with 5 tasks, `GET /tasks?page=1&limit=100` → 5 items, total=5, limit=100

**`task-list.component.spec.ts`** (3 new tests in the `hasNext` describe):
- AC-2: `hasNext(2, 10, 25)` → true
- AC-4: `hasNext(4, 10, 25)` → false
- AC-10: `hasNext(1, 100, 5)` → false

---

`npm test` → **PASS**

```
[backend] PASS
PASS src/tasks/tasks.controller.e2e-spec.ts
PASS src/tasks/tasks.controller.spec.ts
PASS src/priorities/priorities.controller.spec.ts
PASS src/priorities/priorities.service.spec.ts
PASS src/tasks/tasks.service.spec.ts

Test Suites: 5 passed, 5 total
Tests:       57 passed, 57 total
Snapshots:   0 total
Time:        1.724 s
Ran all test suites.


[frontend] PASS
PASS src/app/features/priorities/priority-list.component.spec.ts
PASS src/app/shared/sort.spec.ts
PASS src/app/features/tasks/task-list.component.spec.ts
PASS src/app/features/priorities/priority.logic.spec.ts
PASS src/app/features/priorities/priority-edit.component.spec.ts
PASS src/app/features/priorities/priority-create.component.spec.ts
PASS src/app/features/tasks/task.logic.spec.ts

Test Suites: 7 passed, 7 total
Tests:       55 passed, 55 total
Snapshots:   0 total
Time:        2.772 s
Ran all test suites.

```