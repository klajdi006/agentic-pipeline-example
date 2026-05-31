# Implementation summary — TASK-142 (attempt 2)

Worktree: `wt/TASK-142-2` · branch: `feat/TASK-142-scheduler`

## Backend
- Task entity: +`deadline`, +`remindAt` (timestamptz). Migration `AddTaskDeadline` added.
- `SchedulerService`: @Cron('*/1 * * * *') sweep emits reminders for due `remindAt`.
- `GET /tasks/due-soon` returns tasks with deadlines, ordered ascending.
- remindAt computed in **UTC**: `remindAt = deadline.minus({ hours: 1 })` on the UTC instant. ✅ (fixes AC-1 regression from attempt 1)

## Frontend
- Deadline field added to the typed reactive task form.
- `DueSoonComponent` (standalone, OnPush, signals), dates via `TzDatePipe`.

build: ✅  lint: ✅