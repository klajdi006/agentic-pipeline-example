# Impact assessment — TASK-142

**Request:** deadline-based task scheduler with reminders + "Due soon" view.

## Backend (NestJS)
- `task.entity.ts`: add `deadline timestamptz null`, `remindAt timestamptz null`.
- New `scheduler` module: 1-min @Cron sweep emitting reminders (see ADR-0001).
- New endpoint `GET /tasks/due-soon`.
- **Migration required** (no synchronize).

## Frontend (Angular)
- Deadline field on the task form (typed reactive form).
- New `DueSoonComponent` (standalone, OnPush, signals), sorted by deadline.
- Render dates via `TzDatePipe`.

## Shared
- Extend `Task` contract in `libs/shared-types` with `deadline`, `remindAt`.

## Risks / open questions
- Reminder timing must be computed in **UTC** (CLAUDE.md) — easy to get wrong.
- Cron sweep is single-instance only for now (ADR-0001) — fine at current scale.
- How far before the deadline should the reminder fire? (default proposed: 1 hour)