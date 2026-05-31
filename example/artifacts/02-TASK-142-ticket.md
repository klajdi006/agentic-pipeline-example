# TASK-142 — Deadline-based task scheduler with reminders

**Problem:** Users can't set deadlines or get reminded before tasks are due, so time-sensitive tasks slip.

**In scope:** deadline + reminder on a task; 1-hour-before reminder; Due soon view sorted by deadline
**Out of scope:** recurring tasks; calendar integrations; multi-channel notifications

## Changes
- **Backend:** Task entity: deadline, remindAt, scheduler module (cron sweep), GET /tasks/due-soon, migration
- **Frontend:** deadline field on task form, DueSoonComponent, TzDatePipe rendering
- **Shared:** Task contract: deadline, remindAt

## Acceptance criteria
- **AC-1** — Given a task with a deadline, when it is created, then remindAt is stored as UTC = deadline − 1h.
- **AC-2** — Given remindAt is within the next minute, when the cron sweep runs, then exactly one reminder is emitted.
- **AC-3** — Given tasks with deadlines, when I open Due soon, then they appear sorted ascending by deadline.

_Validated against schemas/spec.schema.json. Awaiting human approval._