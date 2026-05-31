# ADR 0001 — Scheduler uses @nestjs/schedule cron, not an external queue

- **Status:** Accepted
- **Date:** 2026-05-29
- **Context:** We need to fire reminders when a task deadline approaches. Options were
  (a) a Bull/Redis delayed-job queue, or (b) an in-process cron sweep with `@nestjs/schedule`.
- **Decision:** Use a 1-minute `@Cron` sweep in a `SchedulerService` that queries tasks
  whose `remindAt` falls in the next window and emits notifications. No new infra.
- **Consequences:**
  - Pro: zero new dependencies/infra; trivially testable; fits current single-instance deploy.
  - Con: not horizontally safe yet — when we scale out, add a DB advisory lock so only one
    instance runs the sweep. Tracked as a follow-up.
- **Revisit when:** we run more than one backend instance, or reminder volume exceeds ~10k/min.
