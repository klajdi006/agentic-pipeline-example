# Test report — TASK-142 (live)

All ten tests pass, and every acceptance criterion is already covered by the existing `src/tasks/tasks.service.spec.ts`. Here's the AC-to-test mapping:

| AC | Requirement | Covering test |
|----|-------------|---------------|
| AC-1 | omit `priority` → defaults to `"medium"` | `defaults priority to "medium" when omitted on create` |
| AC-2 | explicit `"high"` persisted & returned | `persists and returns an explicit "high" priority` |
| AC-3 | invalid value rejected at DTO boundary | `rejects an out-of-range priority at the DTO boundary` (uses `validateSync` on `CreateTaskDto`) |
| AC-4 | `findAll()` orders high → medium → low | `orders findAll() high → medium → low` |
| AC-5 | equal priorities keep insertion order | `keeps insertion order for equal priorities (stable tiebreaker)` |
| AC-6 | every returned task has `priority` ∈ {low,medium,high} | `returns a priority that is one of low\|medium\|high on every task` |

The spec (and the model/DTO/service implementation) were already in the working tree from the staged changes on this branch. I ran the suite to confirm — no edits were needed, and I did not weaken any existing tests.

```
Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
```

One minor note on AC-3: it's verified at the DTO/`class-validator` layer (the correct boundary, since the in-memory service doesn't re-validate). This matches the spec's intent that "the service/controller does not persist the task" because invalid input never passes validation to reach `create()`.

---

`npm test` → **PASS**

```
PASS src/tasks/tasks.service.spec.ts
  TasksService
    ✓ creates a task with completed=false and a UTC ISO-8601 createdAt (1 ms)
    ✓ lists all created tasks
    ✓ marks a task complete
    ✓ throws NotFound for a missing task (4 ms)
    priority
      ✓ defaults priority to "medium" when omitted on create
      ✓ persists and returns an explicit "high" priority
      ✓ orders findAll() high → medium → low
      ✓ keeps insertion order for equal priorities (stable tiebreaker) (1 ms)
      ✓ rejects an out-of-range priority at the DTO boundary (1 ms)
      ✓ returns a priority that is one of low|medium|high on every task

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
Snapshots:   0 total
Time:        0.719 s, estimated 1 s
Ran all test suites.

```