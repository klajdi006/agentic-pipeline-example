# Agentic Engineering Pipeline — Reference Example

A concrete, inspectable example of the system from the deck: a feature request flows
through a chain of **specialized agents**, gated by **humans**, coordinated by a
**deterministic control plane**, against a small **Angular + NestJS** task app.

This folder is illustrative. The agents here are *simulated* (their outputs are
hard-coded representative artifacts) so the whole pipeline runs offline with **zero
dependencies and no API keys**. In production each agent step is a real Claude
Agent SDK call with the scoped tools listed in its definition.

```
agentic-pipeline-example/
├── README.md                 ← you are here
├── package.json
├── .knowledge/               ← the LIVING knowledge base every agent reads
│   ├── CLAUDE.md             ← coding standards / conventions
│   ├── skills/               ← reusable procedures
│   └── decisions/            ← architecture decision records (ADRs)
├── agents/                   ← one definition per agent (role, model, scoped tools, prompt)
│   ├── 01-scout.md ... 10-closer-curator.md
├── control-plane/            ← the deterministic orchestrator (runnable)
│   ├── events.mjs            ← event vocabulary
│   ├── state-machine.mjs     ← states, gates, transitions, retry policy
│   └── orchestrator.mjs      ← the durable runner (in-memory simulation of Temporal)
├── schemas/                  ← JSON Schemas for the structured handoffs between agents
│   ├── spec.schema.json
│   ├── plan.schema.json
│   └── review-verdict.schema.json
└── example/
    ├── feature-request.md    ← the input: "add a deadline-based task scheduler"
    ├── simulated-agents.mjs  ← stubbed agent outputs (swap for real Agent SDK calls)
    ├── run.mjs               ← wires it together and runs the whole pipeline
    └── artifacts/            ← every artifact the run produces lands here
```

## Run it

```bash
cd agentic-pipeline-example
node example/run.mjs
```

You'll see the feature request walk through every state, the two human gates
(auto-approved in the sim, clearly marked), a **deliberate CI failure on the first
implementation attempt** that routes back and retries (demonstrating failure
handling), and a final curator step that proposes a standards update. Afterwards,
`example/artifacts/` contains the full paper trail:

```
artifacts/
├── 01-impact-assessment.md
├── 02-TASK-142-ticket.md
├── 03-plan.json
├── 04-implementation-summary.md
├── 05-tests-summary.md
├── 06-PR-description.md
├── 07-review-verdict.json
├── 08-preview-e2e-report.md
├── 09-release-report.md
└── 10-standards-update.diff
```

## Run against your LOCAL Claude Code (no API key)

If you have Claude Code installed and are logged in (`claude login`), you can run the
reasoning/authoring agents for real — they call your local `claude` CLI and use your
existing subscription. **No `ANTHROPIC_API_KEY` needed.**

```bash
AGENTS=live node example/run.mjs
```

In live mode: **scout, spec-writer, planner, reviewer, and closer-curator** are real
`claude -p` calls (with the `.knowledge/` base + their `agents/*.md` prompt as the system
prompt, and `--json-schema` forcing structured output where a schema exists). The
infra-bound steps (**implement, test, PR, preview, deploy**) stay simulated because there's
no real repo/CI mounted yet. The same injected CI failure still demonstrates retry routing,
and the Reviewer's pass/block verdict is produced live.

- Switch is one line: `run.mjs` dynamically imports `agents.cli.mjs` (live) vs
  `simulated-agents.mjs` (default) based on the `AGENTS` env var.
- Adapter: `control-plane/claude-cli.mjs` (`runClaude()` shells out to `claude -p`).
- **Note:** using a personal subscription to power an automated backend is fine for this
  local prototype, but production/multi-user use requires API-key billing (the Agent SDK
  blocks subscription auth for exactly this reason).

### Make it FULLY live (real code edits + real ticket)

The repo includes a real product at **`apps/taskapp`** (runnable NestJS backend + Angular
skeleton). Two optional steps upgrade the demo from "reasoning agents only" to end-to-end:

```bash
# 1) Install the backend so implement/test/PR run against real code:
cd apps/taskapp/backend && npm install && cd -

# 2) (optional) Create a real Linear ticket — free personal API key:
#    linear.app → Settings → Security & access → Personal API keys
export LINEAR_API_KEY=lin_api_xxxxxxxx

# Then run live:
AGENTS=live node example/run.mjs
```

With the backend installed, the **implementer** edits `apps/taskapp/backend/src` on a feature
branch via your local `claude` (Read/Edit/Write/Bash), the **test-author** adds Jest specs and
**`npm test` is the real CI gate** — a red suite genuinely routes back to the implementer. The
**pr-agent** captures the real `git diff`. With `LINEAR_API_KEY` set, the **spec-writer** opens
the ticket and the **closer-curator** moves it to Done. Everything degrades gracefully: no
backend `node_modules` → those steps stay simulated; no Linear key → the ticket step no-ops.

> Heads up: a full live run invokes `claude` several times (and runs `npm test`), so it takes a
> few minutes and consumes subscription usage.

## How to make it real

1. Replace each function in `example/simulated-agents.mjs` with an Agent SDK call that
   loads the matching `agents/*.md` system prompt and the `.knowledge/` docs, and is
   granted only the tools in that definition's allowlist.
2. Swap the in-memory `orchestrator.mjs` for a durable engine (Temporal, or a DB +
   queue) and drive transitions from real Linear/GitHub webhooks (`control-plane/events.mjs`).
3. Point the gates at real humans (a Linear approval, a GitHub PR review).

The control plane, schemas, state machine, and knowledge base are already the shapes
you'd use in production — only the agent bodies are stubbed.
