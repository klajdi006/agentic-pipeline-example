// Simulated agents. Each function stands in for a real Claude Agent SDK call: it would
// load the matching agents/*.md system prompt + the .knowledge/ docs, be granted only its
// scoped tools, and return a structured result. Here the outputs are hard-coded
// representative artifacts so the pipeline runs offline.
//
// Contract: async ({ ledger, attempt, log }) => { ok, summary, artifact }
//   ok=false routes back via the state machine's onFail.

const TICKET = "TASK-142";

export function makeAgents({ writeArtifact }) {
  return {
    // 1. SCOUT — read-only impact assessment
    scout: async ({ ledger }) => {
      const md = `# Impact assessment — ${TICKET}

**Request:** deadline-based task scheduler with reminders + "Due soon" view.

## Backend (NestJS)
- \`task.entity.ts\`: add \`deadline timestamptz null\`, \`remindAt timestamptz null\`.
- New \`scheduler\` module: 1-min @Cron sweep emitting reminders (see ADR-0001).
- New endpoint \`GET /tasks/due-soon\`.
- **Migration required** (no synchronize).

## Frontend (Angular)
- Deadline field on the task form (typed reactive form).
- New \`DueSoonComponent\` (standalone, OnPush, signals), sorted by deadline.
- Render dates via \`TzDatePipe\`.

## Shared
- Extend \`Task\` contract in \`libs/shared-types\` with \`deadline\`, \`remindAt\`.

## Risks / open questions
- Reminder timing must be computed in **UTC** (CLAUDE.md) — easy to get wrong.
- Cron sweep is single-instance only for now (ADR-0001) — fine at current scale.
- How far before the deadline should the reminder fire? (default proposed: 1 hour)`;
      writeArtifact("01-impact-assessment.md", md);
      return { ok: true, summary: "Mapped FE/BE/shared surfaces; flagged UTC + single-instance risks.", artifact: md };
    },

    // 2. SPEC WRITER — emits structured spec → Linear ticket. Human gate follows.
    "spec-writer": async ({ ledger }) => {
      const spec = {
        ticketKey: TICKET,
        title: "Deadline-based task scheduler with reminders",
        problem: "Users can't set deadlines or get reminded before tasks are due, so time-sensitive tasks slip.",
        scope: {
          in: ["deadline + reminder on a task", "1-hour-before reminder", "Due soon view sorted by deadline"],
          out: ["recurring tasks", "calendar integrations", "multi-channel notifications"],
        },
        changes: {
          backend: ["Task entity: deadline, remindAt", "scheduler module (cron sweep)", "GET /tasks/due-soon", "migration"],
          frontend: ["deadline field on task form", "DueSoonComponent", "TzDatePipe rendering"],
          shared: ["Task contract: deadline, remindAt"],
        },
        acceptanceCriteria: [
          { id: "AC-1", given: "a task with a deadline", when: "it is created", then: "remindAt is stored as UTC = deadline − 1h" },
          { id: "AC-2", given: "remindAt is within the next minute", when: "the cron sweep runs", then: "exactly one reminder is emitted" },
          { id: "AC-3", given: "tasks with deadlines", when: "I open Due soon", then: "they appear sorted ascending by deadline" },
        ],
        openQuestions: [],
      };
      const md = `# ${spec.ticketKey} — ${spec.title}

**Problem:** ${spec.problem}

**In scope:** ${spec.scope.in.join("; ")}
**Out of scope:** ${spec.scope.out.join("; ")}

## Changes
- **Backend:** ${spec.changes.backend.join(", ")}
- **Frontend:** ${spec.changes.frontend.join(", ")}
- **Shared:** ${spec.changes.shared.join(", ")}

## Acceptance criteria
${spec.acceptanceCriteria.map((a) => `- **${a.id}** — Given ${a.given}, when ${a.when}, then ${a.then}.`).join("\n")}

_Validated against schemas/spec.schema.json. Awaiting human approval._`;
      writeArtifact("02-TASK-142-ticket.md", md);
      return { ok: true, summary: `Drafted ${TICKET} with 3 testable acceptance criteria.`, artifact: spec };
    },

    // 3. PLANNER — ordered, file-level plan
    planner: async ({ ledger }) => {
      const plan = {
        ticketKey: TICKET,
        slices: [
          {
            slice: "backend",
            steps: [
              { order: 1, action: "Add deadline+remindAt to Task entity", files: ["src/tasks/entities/task.entity.ts"], layer: "entity", satisfies: ["AC-1"] },
              { order: 2, action: "Generate migration", files: ["src/migrations/AddTaskDeadline.ts"], layer: "migration", satisfies: ["AC-1"] },
              { order: 3, action: "SchedulerService cron sweep (UTC)", files: ["src/scheduler/scheduler.service.ts", "src/scheduler/scheduler.module.ts"], layer: "service", satisfies: ["AC-2"] },
              { order: 4, action: "GET /tasks/due-soon", files: ["src/tasks/tasks.controller.ts", "src/tasks/tasks.service.ts"], layer: "controller", satisfies: ["AC-3"] },
            ],
          },
          {
            slice: "frontend",
            steps: [
              { order: 1, action: "Deadline field on task form", files: ["src/app/features/tasks/task-form.component.ts"], layer: "component", satisfies: ["AC-1"] },
              { order: 2, action: "DueSoonComponent sorted by deadline", files: ["src/app/features/tasks/due-soon.component.ts"], layer: "component", satisfies: ["AC-3"] },
            ],
          },
        ],
      };
      writeArtifact("03-plan.json", JSON.stringify(plan, null, 2));
      return { ok: true, summary: "Plan: 2 parallel slices (backend 4 steps, frontend 2 steps).", artifact: plan };
    },

    // 4. IMPLEMENTER — attempt 1 ships a UTC bug; attempt 2 fixes it (failure routing demo)
    implementer: async ({ attempt }) => {
      const fixed = attempt >= 2;
      const md = `# Implementation summary — ${TICKET} (attempt ${attempt})

Worktree: \`wt/${TICKET}-${attempt}\` · branch: \`feat/${TICKET}-scheduler\`

## Backend
- Task entity: +\`deadline\`, +\`remindAt\` (timestamptz). Migration \`AddTaskDeadline\` added.
- \`SchedulerService\`: @Cron('*/1 * * * *') sweep emits reminders for due \`remindAt\`.
- \`GET /tasks/due-soon\` returns tasks with deadlines, ordered ascending.
${fixed
  ? "- remindAt computed in **UTC**: `remindAt = deadline.minus({ hours: 1 })` on the UTC instant. ✅ (fixes AC-1 regression from attempt 1)"
  : "- remindAt computed from the server's **local** time (`new Date(deadline.getTime() - 3600_000)` against local tz)."}

## Frontend
- Deadline field added to the typed reactive task form.
- \`DueSoonComponent\` (standalone, OnPush, signals), dates via \`TzDatePipe\`.

build: ✅  lint: ✅`;
      writeArtifact("04-implementation-summary.md", md);
      return { ok: true, summary: fixed ? "Re-implemented remindAt in UTC (AC-1 fix)." : "Implemented FE+BE slices (remindAt in local time — latent AC-1 bug).", artifact: md };
    },

    // 5. TEST AUTHOR — catches the UTC bug on the first pass, green after the fix
    "test-author": async ({ attempt }) => {
      const pass = attempt >= 2; // first time through, the AC-1 test fails
      const md = `# Test report — ${TICKET} (test attempt ${attempt})

Added: scheduler.service.spec.ts, tasks.controller.e2e-spec.ts, due-soon.component.spec.ts

| Criterion | Test | Result |
|-----------|------|--------|
| AC-1 remindAt = deadline−1h (UTC) | scheduler.service.spec | ${pass ? "PASS" : "**FAIL** — got local-time offset, expected UTC instant"} |
| AC-2 cron emits exactly one reminder | scheduler.service.spec | PASS |
| AC-3 due-soon sorted ascending | tasks.controller.e2e | PASS |

Coverage on changed files: ${pass ? "87%" : "86%"} (≥80% ✅)
${pass ? "\nAll acceptance criteria verified. ✅" : "\nAC-1 fails for a user in UTC+2: reminder fired 2h early. Routing back to Implementer."}`;
      writeArtifact("05-tests-summary.md", md);
      return pass
        ? { ok: true, summary: "All 3 acceptance criteria covered and green (87%).", artifact: md }
        : { ok: false, summary: "AC-1 fails: remindAt uses local time, not UTC. CI red → route back.", artifact: md };
    },

    // 6. PR AGENT — opens the PR, description built from the trace
    "pr-agent": async ({ ledger }) => {
      const md = `# PR: ${TICKET} — Deadline-based task scheduler

Closes ${TICKET}.

## What changed & why
Adds task deadlines + a 1-hour-before reminder (cron sweep, ADR-0001) and a Due soon view.

## Acceptance criteria
- [x] **AC-1** remindAt stored as UTC (deadline − 1h) — verified by scheduler.service.spec
- [x] **AC-2** cron emits exactly one reminder — verified by scheduler.service.spec
- [x] **AC-3** Due soon sorted ascending — verified by tasks.controller.e2e

## Notes
- Includes migration \`AddTaskDeadline\`. No \`synchronize\`.
- Coverage on changed files: 87%.

_Branch: feat/${TICKET}-scheduler · CI: green_`;
      writeArtifact("06-PR-description.md", md);
      return { ok: true, summary: "Opened PR #318, linked TASK-142, attached test report.", artifact: md };
    },

    // 7. REVIEWER — adversarial check against CLAUDE.md; passes after the UTC fix
    reviewer: async ({ ledger }) => {
      const verdict = {
        ticketKey: TICKET,
        verdict: "pass",
        findings: [
          { severity: "minor", rule: "ADR-0001 single-instance sweep", file: "src/scheduler/scheduler.service.ts", message: "Add a DB advisory lock before we scale out (follow-up, not blocking)." },
          { severity: "info", rule: "CLAUDE.md UTC", file: "src/scheduler/scheduler.service.ts", message: "remindAt now computed on the UTC instant — correct." },
        ],
        coveredCriteria: ["AC-1", "AC-2", "AC-3"],
      };
      writeArtifact("07-review-verdict.json", JSON.stringify(verdict, null, 2));
      return { ok: true, summary: "Review PASS (1 minor follow-up: advisory lock for scale-out).", artifact: verdict };
    },

    // 8. PREVIEW + E2E — ephemeral env + e2e; human PR-approval gate follows
    "preview-e2e": async ({ ledger }) => {
      const md = `# Preview + E2E report — ${TICKET}

Preview: https://pr-318.preview.taskapp.dev (ephemeral, torn down on merge)

## E2E (Playwright) — mapped to acceptance criteria
- AC-1 set deadline → reminder scheduled at correct UTC time … PASS
- AC-2 reminder appears once at fire time … PASS
- AC-3 Due soon ordering … PASS

Flaky quarantined: 0. Skipped: none.

Awaiting **human PR approval** (gate 2) before merge.`;
      writeArtifact("08-preview-e2e-report.md", md);
      return { ok: true, summary: "Preview deployed; 3/3 e2e PASS. Awaiting human PR approval.", artifact: md };
    },

    // 9. MERGE + RELEASE — idempotent merge, prod deploy, smoke
    "merge-release": async ({ ledger }) => {
      const md = `# Release report — ${TICKET}

- Merged PR #318 (squash) → main @ commit a1b2c3d
- Deploy id: rel_2026_0531_01 (idempotency key)
- Prod smoke: create task w/ deadline → reminder scheduled … PASS
- Due soon endpoint healthy … PASS

Status: SHIPPED ✅`;
      writeArtifact("09-release-report.md", md);
      return { ok: true, summary: "Merged + deployed (rel_2026_0531_01); prod smoke PASS.", artifact: md };
    },

    // 10. CLOSER + CURATOR — close ticket; propose a standards update from review feedback
    "closer-curator": async ({ ledger }) => {
      const diff = `--- a/.knowledge/CLAUDE.md
+++ b/.knowledge/CLAUDE.md
@@ Backend conventions
 - Time is stored as UTC \`timestamptz\`. Never store local time.
+- Derived reminder/scheduling instants MUST be computed on the UTC instant, not by
+  offsetting a local Date. (Added after ${TICKET}: a local-time offset fired reminders
+  early for non-UTC users — caught by tests, see AC-1.)
`;
      writeArtifact("10-standards-update.diff", diff);
      return { ok: true, summary: "Ticket → Done (PR #318 attached). Proposed CLAUDE.md update PR from the AC-1 regression.", artifact: diff };
    },
  };
}
