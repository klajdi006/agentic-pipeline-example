# PR: TASK-142 — Deadline-based task scheduler

Closes TASK-142.

## What changed & why
Adds task deadlines + a 1-hour-before reminder (cron sweep, ADR-0001) and a Due soon view.

## Acceptance criteria
- [x] **AC-1** remindAt stored as UTC (deadline − 1h) — verified by scheduler.service.spec
- [x] **AC-2** cron emits exactly one reminder — verified by scheduler.service.spec
- [x] **AC-3** Due soon sorted ascending — verified by tasks.controller.e2e

## Notes
- Includes migration `AddTaskDeadline`. No `synchronize`.
- Coverage on changed files: 87%.

_Branch: feat/TASK-142-scheduler · CI: green_