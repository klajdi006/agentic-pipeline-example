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
import { STATES } from "../control-plane/state-machine.mjs";
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

// Console "narrator" — stands in for the dashboard / Linear comments in production.
const log = {
  state(id, def, attempt) {
    const a = attempt > 1 ? c.amber(` (attempt ${attempt})`) : "";
    console.log(`\n${c.b(c.blue("▶ " + id))}${a}  ${c.dim("agent:")} ${def.agent}${def.isolation ? c.dim("  [worktree]") : ""}`);
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

// Wrap agents so each success prints its one-line summary after running.
const rawAgents = makeAgents({ writeArtifact });
const agents = Object.fromEntries(
  Object.entries(rawAgents).map(([name, fn]) => [
    name,
    async (ctx) => {
      const r = await fn(ctx);
      if (r.ok !== false) log.done(r.summary);
      return r;
    },
  ])
);

// The human gates. In this demo they auto-approve (clearly marked); in production these
// block on a real Linear approval / GitHub PR review.
async function approveGate(name) {
  return { approved: true, by: name === "human-approve-spec" ? "PM (auto-approved in demo)" : "Tech lead (auto-approved in demo)" };
}

console.log(c.b("\n🤖 Agentic Engineering Pipeline — live run"));
console.log(c.dim("   Request: " + firstLine.slice(0, 80) + (firstLine.length > 80 ? "…" : "")));
console.log(c.dim("   Run folder: runs/" + runId + "/"));
const appReady = existsSync(join(ROOT, "apps/taskapp/backend/node_modules"));
console.log(c.dim("   scout/spec/plan/review/curate call your local `claude`."));
console.log(c.dim("   Linear: " + (process.env.LINEAR_API_KEY ? "enabled — a real ticket will be created/closed" : "disabled (set LINEAR_API_KEY to create a real ticket)")));
console.log(c.dim("   App: " + (appReady ? "installed → implement/test/PR run live against apps/taskapp/backend" : "NOT installed → implement/test/PR will error (cd apps/taskapp/backend && npm install)")));
console.log(c.dim("   states: " + Object.keys(STATES).join(" → ")));

const STATUS_BY_STATE = { DONE: "shipped", ESCALATE: "escalated", ROLLBACK: "rolled-back" };
let exitCode = 0;
try {
  const ledger = await runPipeline({ ticketKey: "TASK-142", request, agents, approveGate, log });
  writeMeta({
    status: STATUS_BY_STATE[ledger.state] || "halted",
    finishedAt: new Date().toISOString(),
    ticket: ledger.linear?.identifier || ledger.ticketKey,
    linearUrl: ledger.linear?.url || null,
    agentRuns: ledger.history.length,
  });
} catch (err) {
  // An agent (or the orchestrator) threw — record the run as errored instead of leaving it
  // dangling as "running", and keep whatever partial artifacts were written.
  console.error(`\n${c.red("✗ Pipeline errored: " + (err?.message || err))}`);
  writeMeta({ status: "error", finishedAt: new Date().toISOString(), error: String(err?.message || err) });
  exitCode = 1;
} finally {
  writeIndex(ROOT); // always refresh the index, success or failure
}

console.log(c.dim(`\nThis run: runs/${runId}/  ·  all runs: runs/INDEX.md\n`));
process.exitCode = exitCode; // set (don't process.exit) so stdout flushes to the web stream first
