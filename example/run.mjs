// Runs the whole pipeline offline and writes the artifact trail to example/artifacts/.
//   node example/run.mjs

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runPipeline } from "../control-plane/orchestrator.mjs";
import { STATES } from "../control-plane/state-machine.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = join(__dir, "artifacts");
mkdirSync(ARTIFACTS, { recursive: true });

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

// Choose agent implementations: AGENTS=live → real local `claude` CLI; default → simulated.
const LIVE = process.env.AGENTS === "live";
const { makeAgents } = await import(LIVE ? "./agents.cli.mjs" : "./simulated-agents.mjs");

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

// The human gates. In the sim they auto-approve (clearly marked); in production these
// block on a real Linear approval / GitHub PR review.
async function approveGate(name, ledger) {
  return { approved: true, by: name === "human-approve-spec" ? "PM (auto-approved in demo)" : "Tech lead (auto-approved in demo)" };
}

// Input precedence: a CLI arg (inline text OR a path to a file) → else feature-request.md.
//   node example/run.mjs "Add a CSV export endpoint for tasks"
//   node example/run.mjs ./my-request.md
const arg = process.argv[2];
const request = arg
  ? (existsSync(arg) ? readFileSync(arg, "utf8") : arg)
  : readFileSync(join(__dir, "feature-request.md"), "utf8");

const firstLine = request.split("\n").find((l) => l.trim() && !l.startsWith("#"))?.trim() ?? request.trim();
console.log(c.b("\n🤖 Agentic Engineering Pipeline — demo run"));
console.log(c.dim("   Request: " + firstLine.slice(0, 80) + (firstLine.length > 80 ? "…" : "")));
if (LIVE) {
  const appReady = existsSync(join(__dir, "../apps/taskapp/backend/node_modules"));
  console.log(c.dim("   LIVE: scout/spec/plan/review/curate call your local `claude`."));
  console.log(c.dim("   Linear: " + (process.env.LINEAR_API_KEY ? "enabled — a real ticket will be created/closed" : "disabled (set LINEAR_API_KEY to create a real ticket)")));
  console.log(c.dim("   App: " + (appReady ? "installed → implement/test/PR run live against apps/taskapp/backend" : "not installed → implement/test/PR simulated (cd apps/taskapp/backend && npm install)")));
} else {
  console.log(c.dim("   (agents are simulated; gates auto-approve; one CI failure is injected to show retry routing)"));
}
console.log(c.dim("   states: " + Object.keys(STATES).join(" → ")));

await runPipeline({ ticketKey: "TASK-142", request, agents, approveGate, log });

console.log(c.dim("\nArtifacts written to example/artifacts/ — the full paper trail of this feature.\n"));
