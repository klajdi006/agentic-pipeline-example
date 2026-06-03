// Runs the pipeline LIVE (real `claude` / `npm test` / `git`). Everything for one run —
// all artifacts plus a meta.json — is written to its own folder under runs/<id>/, and
// runs/INDEX.md is regenerated so you always have a navigable table of contents.
//
//   node runner/run.mjs "Add a CSV export endpoint for tasks"
//   node runner/run.mjs ./my-request.md

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runPipeline } from "../control-plane/orchestrator.mjs";
import { STATES, FAST_STATES, FAST_START, FAST_MAX_ATTEMPTS } from "../control-plane/state-machine.mjs";
import { classify } from "./classifier.mjs";
import { drainUsage, killActive } from "../control-plane/claude-cli.mjs";
import { createWorktree } from "../control-plane/worktree.mjs";
import { getIssueState, linearEnabled } from "../control-plane/linear.mjs";
import { makeAgents } from "./agents.cli.mjs";
import { makeRunId, runDir, firstLine as firstLineOf, writeIndex } from "./runs.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");

// Load .env (LINEAR_API_KEY, CLAUDE_MODEL, …) so the web UI and a bare `node runner/run.mjs`
// both pick it up — no need to remember `--env-file`. Existing env vars win.
const ENV_FILE = join(ROOT, ".env");
if (existsSync(ENV_FILE) && typeof process.loadEnvFile === "function") {
  try { process.loadEnvFile(ENV_FILE); } catch { /* malformed .env — ignore */ }
}

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  teal: (s) => `\x1b[36m${s}\x1b[0m`,
  amber: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  purple: (s) => `\x1b[35m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
};

// ---- input: a request is required (inline text or a path to a file) ----
const arg = process.argv[2];
if (!arg || !arg.trim()) {
  console.error(c.red("\n✗ No feature request provided.") + c.dim('\n  Usage: node runner/run.mjs "Add a CSV export endpoint for tasks"\n         node runner/run.mjs ./my-request.md\n'));
  process.exit(1);
}
const request = existsSync(arg) ? readFileSync(arg, "utf8") : arg;
const firstLine = firstLineOf(request);

// ---- this run's own folder (the web server passes RUN_ID so paths match) ----
const startedAt = new Date().toISOString();
const runId = process.env.RUN_ID || makeRunId(firstLine);
process.env.RUN_ID = runId; // make it available to the agents (e.g. for the Linear comment)
const RUN_DIR = runDir(ROOT, runId);
mkdirSync(RUN_DIR, { recursive: true });

function writeArtifact(name, content) {
  writeFileSync(join(RUN_DIR, name), content);
  console.log(c.dim(`        ↳ wrote ${name}`));
  return join(RUN_DIR, name);
}
function writeMeta(extra) {
  writeFileSync(
    join(RUN_DIR, "meta.json"),
    JSON.stringify({ id: runId, request: firstLine, startedAt, ...extra }, null, 2)
  );
}
writeMeta({ status: "running" }); // so an in-flight run shows up in the history list

// Human-readable cost/latency report — also shows up as an artifact chip in the web UI.
const k = (n) => (n / 1000).toFixed(1) + "k";
const usd = (n) => "$" + n.toFixed(4);
function writeMetricsArtifact(ledger) {
  const t = metrics.totals;
  const est = t.estimated ? " _(cost estimated from tokens — CLI reported none)_" : "";
  const cacheSummary = [
    t.cacheCreateTokens > 0 ? `${k(t.cacheCreateTokens)} written` : "",
    t.cacheReadTokens > 0 ? `${k(t.cacheReadTokens)} read` : "",
  ].filter(Boolean).join(", ");
  const cacheNote = cacheSummary ? ` · cache: ${cacheSummary}` : " · no cache hits";
  const rows = metrics.perState.map((s) => {
    const parts = [];
    if (s.cacheCreateTokens > 0) parts.push(`+${k(s.cacheCreateTokens)} write`);
    if (s.cacheReadTokens > 0) parts.push(`${k(s.cacheReadTokens)} read`);
    const cache = parts.length ? ` (${parts.join(", ")})` : "";
    return `| ${s.state} | ${s.attempt} | ${s.calls} | ${usd(s.costUsd)} | ${k(s.tokensIn)} / ${k(s.tokensOut)}${cache} | ${(s.durationMs / 1000).toFixed(1)}s |`;
  });
  const esc = (ledger?.escalations || []).map((e) =>
    `- **${e.state}** (attempt ${e.attempt}) → ${e.target}: ${cell(e.reason)}`);
  const md = [
    `# Run metrics — ${ledger?.ticketKey || ""}`,
    "",
    `**Total:** ${usd(t.costUsd)}${est} · ${t.claudeCalls} claude calls · ${k(t.tokensIn)} in / ${k(t.tokensOut)} out · ${(t.durationMs / 1000).toFixed(1)}s${cacheNote}`,
    "",
    "| State | Attempt | Calls | Cost | Tokens (in/out) | Duration |",
    "|---|---|---|---|---|---|",
    ...rows,
    ...(esc.length ? ["", "## Routing / escalations", "", ...esc] : []),
    "",
  ].join("\n");
  writeArtifact("00-metrics.md", md);
}
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

// Console "narrator" — stands in for the dashboard / Linear comments in production.
const log = {
  state(id, def, attempt) {
    const a = attempt > 1 ? c.amber(` (attempt ${attempt})`) : "";
    console.log(`\n${c.b(c.blue("▶ " + id))}${a}  ${c.dim("agent:")} ${def.agent}`);
  },
  fail(id, why, target) {
    console.log(`  ${c.red("✗ FAIL")} ${why}`);
    console.log(`  ${c.amber("↺ routing back → " + target)}`);
  },
  escalate(id, attempt) {
    console.log(`  ${c.red("⚑ ESCALATE to human after " + attempt + " attempts")}`);
  },
  gate(name) {
    console.log(`  ${c.purple("✋ HUMAN GATE: " + name)}`);
  },
  gateResult(name, d) {
    console.log(`  ${c.purple(d.approved ? "✓ approved" : "✗ rejected")} ${c.dim("by " + d.by)}`);
  },
  done(summary) {
    console.log(`  ${c.green("✓")} ${summary}`);
  },
  end(state, ledger) {
    console.log("\n" + c.dim("─".repeat(64)));
    const ok = state === "DONE";
    console.log(ok ? c.b(c.green("● PIPELINE COMPLETE — feature shipped")) : c.b(c.red("● PIPELINE HALTED: " + state)));
    console.log(c.dim(`  ${ledger.history.length} agent runs · ticket ${ledger.ticketKey}`));
  },
};

// Per-run observability: tokens / cost / latency, attributed to each pipeline state.
const metrics = { perState: [], totals: { costUsd: 0, tokensIn: 0, tokensOut: 0, cacheCreateTokens: 0, cacheReadTokens: 0, durationMs: 0, claudeCalls: 0, estimated: false } };
function recordState(state, attempt, calls) {
  if (!calls.length) return; // stub states (preview/merge) make no claude calls
  const agg = calls.reduce((a, x) => ({
    costUsd: a.costUsd + x.costUsd, tokensIn: a.tokensIn + x.tokensIn,
    tokensOut: a.tokensOut + x.tokensOut,
    cacheCreateTokens: a.cacheCreateTokens + (x.cacheCreateTokens || 0),
    cacheReadTokens: a.cacheReadTokens + (x.cacheReadTokens || 0),
    durationMs: a.durationMs + x.durationMs, estimated: a.estimated || x.estimated,
  }), { costUsd: 0, tokensIn: 0, tokensOut: 0, cacheCreateTokens: 0, cacheReadTokens: 0, durationMs: 0, estimated: false });
  metrics.perState.push({ state, attempt, calls: calls.length, ...agg });
  const t = metrics.totals;
  t.costUsd += agg.costUsd; t.tokensIn += agg.tokensIn; t.tokensOut += agg.tokensOut;
  t.cacheCreateTokens += agg.cacheCreateTokens; t.cacheReadTokens += agg.cacheReadTokens;
  t.durationMs += agg.durationMs; t.claudeCalls += calls.length; t.estimated = t.estimated || agg.estimated;
}

// By default the implementer edits apps/taskapp IN PLACE and leaves the changes UNCOMMITTED
// in your working tree — so `git status` shows them and you review/commit/discard yourself.
// Opt into WORKTREE=1 for an isolated per-run worktree (enables parallel runs — also bump
// MAX_CONCURRENT_RUNS on the server).
let workspace = null;
if (process.env.WORKTREE) {
  try {
    workspace = await createWorktree({ root: ROOT, appDir: join(ROOT, "apps/taskapp"), runId });
    console.log(c.dim(`   Worktree: .worktrees/${runId}/ on ${workspace.branch}`));
  } catch (e) {
    console.log(c.amber(`   ⚠ worktree isolation unavailable (${e.message}) — editing the main checkout.`));
  }
} else {
  console.log(c.dim("   Editing apps/taskapp in place — changes stay UNCOMMITTED in your working tree (review with `git status`)."));
}

// Set true on a stop request (SIGTERM / Ctrl-C). The wrapper below refuses to start any
// further agent once it's set, so the pipeline can't advance into a worktree that's about
// to be torn down — the loop unwinds and the single cleanup happens in `finally`.
let stopping = false;

// Wrap agents so each success prints its one-line summary AND its claude usage is
// attributed to the state it ran in (ctx.ledger.state is the current state).
const rawAgents = makeAgents({ writeArtifact, workspace });
const agents = Object.fromEntries(
  Object.entries(rawAgents).map(([name, fn]) => [
    name,
    async (ctx) => {
      if (stopping) throw new Error("run stopped by user"); // don't start a new stage mid-stop
      const r = await fn(ctx);
      recordState(ctx.ledger.state, ctx.attempt, drainUsage());
      if (r.ok !== false) log.done(r.summary);
      return r;
    },
  ])
);

// The human gates. For spec approval, poll Linear if enabled; otherwise auto-approve.
// For PR approval, auto-approve (needs real CI/GitHub review in production).
async function approveGate(name, ledger) {
  if (name === "human-approve-spec" && linearEnabled() && ledger?.linear?.id) {
    console.log(c.purple(`\n✋ HUMAN GATE: Waiting for approval…`));
    console.log(c.dim(`   Move Linear ticket [${ledger.linear.identifier}] to 'In Progress' or 'Ready for Dev' to resume.`));

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      const state = await getIssueState(ledger.linear.id);
      if (!state) continue;

      const stateName = state.name.toLowerCase();
      if (state.type === "started" || stateName.includes("approved") || stateName.includes("ready")) {
        return { approved: true, by: `PO via Linear (Status: ${state.name})` };
      }
    }
  }

  // Fallback: auto-approve for demo or other gates.
  return { approved: true, by: name === "human-approve-spec" ? "PM (auto-approved in demo)" : "Tech lead (auto-approved in demo)" };
}

const complexity = classify(request);
const isFast = complexity === "trivial";

console.log(c.b("\n🤖 Agentic Engineering Pipeline — live run"));
console.log(c.dim("   Request: " + firstLine.slice(0, 80) + (firstLine.length > 80 ? "…" : "")));
console.log(c.dim("   Run folder: runs/" + runId + "/"));
const appReady = existsSync(join(ROOT, "apps/taskapp/backend/node_modules"));
if (isFast) {
  console.log(c.teal("   ⚡ Fast path") + c.dim(" — trivial change detected, skipping scout/spec/plan/pr/review/curate"));
  console.log(c.dim("   states: fast_implement → DONE"));
} else {
  console.log(c.dim("   ◎ Full pipeline — spec/plan/implement/test/pr/review/curate call your local `claude`."));
  console.log(c.dim("   Linear: " + (process.env.LINEAR_API_KEY ? "enabled — a real ticket will be created/closed" : "disabled (set LINEAR_API_KEY to create a real ticket)")));
  console.log(c.dim("   states: " + Object.keys(STATES).join(" → ")));
}
console.log(c.dim("   App: " + (appReady ? "installed → implement/test run live against apps/taskapp/backend" : "NOT installed → implement/test will error (cd apps/taskapp/backend && npm install)")));

const STATUS_BY_STATE = { DONE: "shipped", ESCALATE: "escalated", ROLLBACK: "rolled-back" };
let exitCode = 0;
let ledger = null;

// Graceful stop (SIGTERM from the server's stop button, or Ctrl-C). DON'T clean up here —
// just flag it and kill the in-flight claude call. The kill makes the current stage reject;
// the wrapper's guard stops the next stage from starting; runPipeline then rejects and the
// single cleanup runs in `finally`, once nothing is using the worktree. (Cleaning up here
// would race the still-running loop and delete the worktree out from under the next agent.)
function gracefulStop() {
  if (stopping) return;
  stopping = true;
  console.log(c.amber("\n■ stop requested — halting (worktree is cleaned up on exit)…"));
  killActive();
}
process.on("SIGTERM", gracefulStop);
process.on("SIGINT", gracefulStop);
try {
  ledger = await runPipeline({
    ticketKey: process.env.TICKET_KEY || "TASK-142",
    request,
    agents,
    approveGate,
    log,
    ...(isFast ? { states: FAST_STATES, start: FAST_START, maxAttempts: FAST_MAX_ATTEMPTS } : {}),
  });
  writeMeta({
    status: STATUS_BY_STATE[ledger.state] || "halted",
    finishedAt: new Date().toISOString(),
    ticket: ledger.linear?.identifier || ledger.ticketKey,
    linearUrl: ledger.linear?.url || null,
    agentRuns: ledger.history.length,
    metrics,
    escalations: ledger.escalations,
    escalation: ledger.escalation || null,
  });
} catch (err) {
  if (stopping) {
    // User-requested stop — record it as stopped, not an error.
    writeMeta({ status: "stopped", finishedAt: new Date().toISOString(), metrics, escalations: ledger?.escalations || [] });
    exitCode = 130;
  } else {
    // An agent (or the orchestrator) threw — record the run as errored instead of leaving it
    // dangling as "running", and keep whatever partial artifacts were written.
    console.error(`\n${c.red("✗ Pipeline errored: " + (err?.message || err))}`);
    writeMeta({ status: "error", finishedAt: new Date().toISOString(), error: String(err?.message || err), metrics });
    exitCode = 1;
  }
} finally {
  try { writeMetricsArtifact(ledger); } catch { /* best-effort */ }
  // Tear down the worktree + per-run branch (the diff is already saved as an artifact).
  // KEEP_WORKTREE=1 retains it for inspecting the produced code.
  if (workspace && !process.env.KEEP_WORKTREE) {
    try { await workspace.cleanup(); } catch { /* best-effort */ }
  } else if (workspace) {
    console.log(c.dim(`   Worktree kept: .worktrees/${runId}/ (KEEP_WORKTREE)`));
  }
  writeIndex(ROOT); // always refresh the index, success or failure
}

// One-line cost summary at the end of the run (mirrors the per-state breakdown above).
const _t = metrics.totals;
console.log(c.dim(`  ${usd(_t.costUsd)}${_t.estimated ? " est." : ""} · ${k(_t.tokensIn + _t.tokensOut)} tokens · ${(_t.durationMs / 1000).toFixed(1)}s across ${_t.claudeCalls} claude calls`));

console.log(c.dim(`\nThis run: runs/${runId}/  ·  all runs: runs/INDEX.md\n`));
process.exitCode = exitCode; // set (don't process.exit) so stdout flushes to the web stream first
