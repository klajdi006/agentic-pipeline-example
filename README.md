# Agentic Engineering Pipeline — Reference Example

A runnable reference where a feature request flows through a chain of **specialized AI
agents** — gated by **humans** at the moments that matter — coordinated by a
**deterministic control plane**, against a real **Angular + NestJS** app.

It runs on your **local Claude Code** (no `ANTHROPIC_API_KEY` needed): each agent is a
`claude -p` call. The agents really edit code, run tests, and open a Linear ticket.

📊 **Overview presentation:** https://docs.google.com/presentation/d/1gq0n8EpFkg3qoHkcTDvq-pvFommCvJwpZpyPd7qh5nQ/edit?usp=sharing

---

## What it does

You describe a feature in a sentence. Then:

1. **Scout** reads the app and assesses impact
2. **Spec writer** writes a structured spec → **creates a Linear ticket** → ✋ *you approve*
3. **Planner** produces a file-level plan
4. **Implementer** edits the code **full-stack** (NestJS + Angular) on a branch
5. **Test author** writes Jest specs and runs `npm test` on **both stacks** — the real gate
6. **PR agent** captures the real `git diff`; **Reviewer** checks it against your standards
7. ✋ *you approve the PR* → **Merge/Deploy** → **Closer** moves the Linear ticket to Done

A failing test or a blocking review routes back to the implementer **with the reason**, so
the loop converges instead of retrying blind.

---

## Repository layout

```
agentic-pipeline-example/
├── .env / .env.example       ← config: LINEAR_API_KEY, CLAUDE_MODEL (see below)
├── .knowledge/               ← the LIVING knowledge base every agent reads
│   ├── CLAUDE.md             ← coding standards (also the reviewer's rubric)
│   ├── skills/               ← reusable procedures (add a NestJS module / Angular feature)
│   └── decisions/            ← architecture decision records (ADRs)
├── agents/                   ← 10 agent definitions: role, model, scoped tools, prompt
├── schemas/                  ← JSON Schemas for the structured handoffs between agents
├── control-plane/
│   ├── state-machine.mjs     ← states, gates, transitions, retry/failure routing
│   ├── orchestrator.mjs      ← the runner (in-memory stand-in for Temporal)
│   ├── events.mjs            ← event vocabulary
│   ├── claude-cli.mjs        ← adapter: runs each agent via your local `claude -p`
│   └── linear.mjs            ← Linear GraphQL client (create / comment / close)
├── runner/
│   ├── run.mjs               ← wires it together and runs the pipeline (entry point)
│   ├── agents.cli.mjs        ← the live agents (real claude + real edits + Linear)
│   └── artifacts/            ← the current run's paper trail (overwritten each run)
├── server.mjs                ← tiny web server: runs the pipeline, streams output to the browser
├── web/index.html            ← browser UI: type a request, watch the live terminal
├── history/                  ← one file per successful run (request + plan), never overwritten
├── libs/shared-types/        ← request/response contracts shared by FE + BE
└── apps/taskapp/             ← THE PRODUCT the agents build into
    ├── backend/              ← NestJS, in-memory store, Jest (runnable + tested)
    └── frontend/             ← Angular v21 standalone workspace, ts-jest (runnable + tested)
```

---

## Run it

The pipeline always runs **live** against your local Claude.

**Prerequisites:** Claude Code installed and logged in (`claude login`), and the target app
installed so the implement/test steps run for real:

```bash
cp .env.example .env                 # paste your Linear key (optional); tweak CLAUDE_MODEL if you like
cd apps/taskapp/backend  && npm install && cd -
cd apps/taskapp/frontend && npm install && cd -
```

`.env` is loaded automatically by the runner — no `--env-file` needed.

### Web UI (recommended)

```bash
npm run web        # → http://localhost:4000   (set PORT=… to change)
```

Type a feature request, hit **Run**, and watch every state — including each agent's live
tool calls (`→ Read(…)`, `→ Bash(npm test)`, `→ Edit(…)`) — stream into the page. Runs stack
like a chat transcript.

### Command line

```bash
node runner/run.mjs "add a due-date field to tasks"
node runner/run.mjs ./my-request.md
```

A request is required (there's no default). Either way the agents reason about your real app,
edit `apps/taskapp`, run `npm test`, and (with a Linear key) open + close a real ticket. Each
successful run appends its plan to `history/`.

> A live run makes several `claude` calls and runs the test suites, so it takes a few
> minutes and uses your subscription quota.

---

## Configuration (`.env`)

`.env` is loaded automatically by the runner and the web server — no `--env-file` needed.
It's gitignored; `.env.example` is the template.

| Variable | What it does |
|---|---|
| `LINEAR_API_KEY` | Free personal key → spec-writer creates a real ticket, closer marks it Done. Unset = that step no-ops. |
| `LINEAR_TEAM_ID` | Optional. Defaults to your first Linear team. |
| `CLAUDE_MODEL` | Model passed to `claude --model …` (e.g. `claude-sonnet-4-6`). Unset = your Claude Code default. |

---

## The product: `apps/taskapp`

A real, runnable app the agents extend. Run it independently any time:

```bash
# backend — NestJS API on :3000 (CORS enabled for the dev frontend)
cd apps/taskapp/backend && npm install && npm start
cd apps/taskapp/backend && npm test          # Jest unit specs

# frontend — Angular v21 on :4200
cd apps/taskapp/frontend && npm install && npm start    # → http://localhost:4200
cd apps/taskapp/frontend && npm test          # ts-jest (pure logic)
```

The frontend's API base comes from `src/environments/` (`environment.development.ts` →
`http://localhost:3000/api`; `environment.ts` → `/api` for production), swapped via
`fileReplacements` in `angular.json`. Shared request/response types live in
`libs/shared-types/` and are imported by both sides.

---

## What's live vs stubbed

| Live (really happens) | Stubbed (not executed) |
|---|---|
| Scout / Spec / Plan / Review / Curate via local `claude` | Opening a GitHub PR (we capture the diff only) |
| Implementer edits real backend + frontend code | Preview environment + E2E run |
| `npm test` on both stacks — the gate | Merge + production deploy |
| Spec-writer creates a Linear ticket; closer closes it | Human approvals (auto-approved in the demo) |
| Real `git diff` + full artifact trail | |

The two stubbed back-half steps (`preview_e2e`, `merge_release`) are inline placeholders
clearly marked "infra step — not executed" — the obvious build-out points for production.

---

## How it works (design notes for forking)

- **Deterministic control plane.** `state-machine.mjs` owns the states, the two human gates,
  and retry/failure routing; `orchestrator.mjs` walks it. Agents are stateless workers.
- **Least privilege.** Each agent (`agents/NN-*.md`) declares a scoped tool allowlist — the
  reviewer literally cannot merge.
- **Structured handoffs.** Agents emit schema-validated JSON (`schemas/`), not chat, so a bad
  handoff fails loudly instead of poisoning the next step.
- **Living knowledge base.** Every agent's system prompt = `.knowledge/` (standards + skills +
  ADRs) + its own definition. The reviewer gates against `CLAUDE.md`; the curator proposes
  updates to it from review feedback.
- **Graceful degradation.** No Linear key → ticket step no-ops. App not installed → implement/
  test fail fast with a clear `npm install` message. App inside a parent git repo → it edits in
  place without nesting a repo.

### Make it production-grade

- **Auth:** swap the local CLI for the Claude Agent SDK + API key (or Bedrock / Vertex).
- **Back half:** add `gh pr create`, real preview envs + E2E, and prod deploy in place of the stubs.
- **Durability:** replace the in-memory orchestrator with Temporal (or a DB + queue) driven by Linear/GitHub webhooks.
- **Parallelism:** give each implement run its own git worktree.
- **Your stack:** point `apps/taskapp` at your repo and rewrite the agent prompts + `.knowledge/` to your conventions.
