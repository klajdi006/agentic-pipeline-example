// Runs the pipeline LIVE (real `claude` / `npm test` / `git`) and writes the artifact
// trail for the current run to runner/artifacts/. On a successful run it also appends
// the planner result to history/ so future runs have an overview of what shipped before.
//
//   node runner/run.mjs "Add a CSV export endpoint for tasks"
//   node runner/run.mjs ./my-request.md

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runPipeline } from "../control-plane/orchestrator.mjs";
import { STATES } from "../control-plane/state-machine.mjs";
import { makeAgents } from "./agents.cli.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = join(__dir, "artifacts");      // transient trail for the current run
const HISTORY = join(__dir, "..", "history");    // durable, one file per successful run
mkdirSync(ARTIFACTS, { recursive: true });

// Load .env (LINEAR_API_KEY, CLAUDE_MODEL, …) so the web UI and a bare `node runner/run.mjs`
// both pick it up — no need to remember `--env-file`. Existing env vars win, so an explicit
// `--env-file` or exported value still takes precedence.
const ENV_FILE = join(__dir, "..", ".env");
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

function writeArtifact(name, content) {
  const p = join(ARTIFACTS, name);
  writeFileSync(p, content);
  console.log(c.dim(`        ↳ wrote artifacts/${name}`));
  return p;
}

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
async function approveGate(name, ledger) {
  return { approved: true, by: name === "human-approve-spec" ? "PM (auto-approved in demo)" : "Tech lead (auto-approved in demo)" };
}

// Input: a CLI arg — inline text OR a path to a file. A request is now REQUIRED
// (there is no default feature-request.md anymore).
const arg = process.argv[2];
if (!arg || !arg.trim()) {
  console.error(c.red("\n✗ No feature request provided.") + c.dim('\n  Usage: node runner/run.mjs "Add a CSV export endpoint for tasks"\n         node runner/run.mjs ./my-request.md\n'));
  process.exit(1);
}
const request = existsSync(arg) ? readFileSync(arg, "utf8") : arg;

const firstLine = request.split("\n").find((l) => l.trim() && !l.startsWith("#"))?.trim() ?? request.trim();
console.log(c.b("\n🤖 Agentic Engineering Pipeline — live run"));
console.log(c.dim("   Request: " + firstLine.slice(0, 80) + (firstLine.length > 80 ? "…" : "")));
const appReady = existsSync(join(__dir, "../apps/taskapp/backend/node_modules"));
console.log(c.dim("   scout/spec/plan/review/curate call your local `claude`."));
console.log(c.dim("   Linear: " + (process.env.LINEAR_API_KEY ? "enabled — a real ticket will be created/closed" : "disabled (set LINEAR_API_KEY to create a real ticket)")));
console.log(c.dim("   App: " + (appReady ? "installed → implement/test/PR run live against apps/taskapp/backend" : "NOT installed → implement/test/PR will error (cd apps/taskapp/backend && npm install)")));
console.log(c.dim("   states: " + Object.keys(STATES).join(" → ")));

const ledger = await runPipeline({ ticketKey: "TASK-142", request, agents, approveGate, log });

// Durable record: on success, append THIS run's plan to history/ (one file per run, never
// overwritten) so future runs can see what was built before.
if (ledger.state === "DONE" && ledger.artifacts.plan) {
  mkdirSync(HISTORY, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = firstLine.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "run";
  const file = `${ts}-${slug}.json`;
  writeFileSync(
    join(HISTORY, file),
    JSON.stringify({ completedAt: new Date().toISOString(), ticketKey: ledger.ticketKey, request: firstLine, plan: ledger.artifacts.plan }, null, 2)
  );
  console.log(c.dim(`\n  ↳ saved plan to history/${file}`));
}

console.log(c.dim("\nArtifacts for this run are in runner/artifacts/ · plan history in history/.\n"));
