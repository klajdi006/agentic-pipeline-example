// LIVE agents. Contract per agent: async ({ ledger, attempt, log }) => { ok, summary, artifact }.
//
//  • scout, spec-writer, planner, reviewer, closer-curator  → real `claude` calls.
//  • spec-writer / closer-curator                            → create + close a Linear ticket
//                                                               (if LINEAR_API_KEY is set).
//  • implementer, test-author, pr-agent                      → operate on the REAL backend at
//                                                               apps/taskapp/backend. The app must
//                                                               be installed (node_modules present)
//                                                               or these throw a clear error.
//  • preview-e2e, merge-release                              → inline stubs, NOT executed
//                                                               (need preview infra / real CI/CD).
//
// `npm test` in the backend is the real CI gate: a red suite returns ok:false and the
// orchestrator routes back to the implementer — exactly the deck's failure loop, for real.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runClaude } from '../control-plane/claude-cli.mjs';
import { createIssue, addComment, markDone, linearEnabled } from '../control-plane/linear.mjs';
import { listRuns } from './runs.mjs';

const exec = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'apps/taskapp');
const BACKEND = join(APP, 'backend');
const FRONTEND = join(APP, 'frontend');
const BRANCH = 'feat/TASK-142-scheduler';
const APP_READY = existsSync(join(BACKEND, 'node_modules')); // installed → implement/test go live
const TICKET = 'TASK-142';

const TOOLS = ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob'];

// ---- git / npm helpers (never throw — return output for the trace) -------------
async function git(args) {
  try {
    const { stdout } = await exec('git', ['-C', APP, ...args], { maxBuffer: 32 * 1024 * 1024 });
    return stdout;
  } catch (e) {
    return (e.stdout || '') + (e.stderr || e.message);
  }
}
// Decide how to handle git for apps/taskapp WITHOUT ever creating a nested repo:
//  'own'    → apps/taskapp is its own repo (standalone use) → safe to branch.
//  'parent' → it lives inside a parent repo (e.g. the example repo you pushed) → DON'T
//             init or branch; just edit the working tree and capture a path-scoped diff.
let repoMode = null;
async function ensureRepo() {
  if (repoMode) return repoMode;
  let top = '';
  try { top = (await exec('git', ['-C', APP, 'rev-parse', '--show-toplevel'])).stdout.trim(); } catch { /* no repo */ }
  if (top && top !== APP) { repoMode = 'parent'; return repoMode; }   // inside a parent repo — never nest
  if (top === APP) { repoMode = 'own'; return repoMode; }
  // No git repo anywhere → create a dedicated one so branch isolation works standalone.
  await exec('git', ['-C', APP, 'init', '-b', 'main']).catch(() => {});
  await exec('git', ['-C', APP, 'add', '-A']).catch(() => {});
  await exec('git', ['-C', APP, '-c', 'user.email=pipeline@local', '-c', 'user.name=pipeline', 'commit', '-m', 'baseline'], { maxBuffer: 32 * 1024 * 1024 }).catch(() => {});
  repoMode = 'own';
  return repoMode;
}

async function runTests(cwd, label) {
  try {
    const { stdout, stderr } = await exec('npm', ['test', '--silent'], { cwd, maxBuffer: 64 * 1024 * 1024 });
    return { ok: true, out: `[${label}] PASS\n${stdout}${stderr}` };
  } catch (e) {
    return { ok: false, out: `[${label}] FAIL\n${e.stdout || ''}${e.stderr || e.message}` };
  }
}

// The real CI gate — runs BOTH stacks. Frontend is gated only if it's installed.
async function npmTest() {
  const be = await runTests(BACKEND, 'backend');
  const fe = existsSync(join(FRONTEND, 'node_modules'))
    ? await runTests(FRONTEND, 'frontend')
    : { ok: true, out: '[frontend] skipped — run `npm install` in apps/taskapp/frontend to gate the FE' };
  return { ok: be.ok && fe.ok, out: `${be.out}\n\n${fe.out}` };
}

// ---- structured-output schemas (trimmed for the CLI's --json-schema) ----------
const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    ticketKey: { type: 'string' },
    title: { type: 'string' },
    problem: { type: 'string' },
    scope: {
      type: 'object',
      properties: { in: { type: 'array', items: { type: 'string' } }, out: { type: 'array', items: { type: 'string' } } },
    },
    changes: {
      type: 'object',
      properties: {
        frontend: { type: 'array', items: { type: 'string' } },
        backend: { type: 'array', items: { type: 'string' } },
        shared: { type: 'array', items: { type: 'string' } },
      },
    },
    acceptanceCriteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, given: { type: 'string' }, when: { type: 'string' }, then: { type: 'string' } },
        required: ['id', 'given', 'when', 'then'],
      },
    },
  },
  required: ['title', 'problem', 'acceptanceCriteria'],
};

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    ticketKey: { type: 'string' },
    slices: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slice: { type: 'string', enum: ['backend', 'frontend', 'shared'] },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                order: { type: 'integer' },
                action: { type: 'string' },
                files: { type: 'array', items: { type: 'string' } },
                satisfies: { type: 'array', items: { type: 'string' } },
              },
              required: ['action', 'files'],
            },
          },
        },
        required: ['slice', 'steps'],
      },
    },
  },
  required: ['slices'],
};

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    ticketKey: { type: 'string' },
    verdict: { type: 'string', enum: ['pass', 'block'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['info', 'minor', 'major', 'blocker'] },
          rule: { type: 'string' },
          file: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['severity', 'message'],
      },
    },
    coveredCriteria: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'findings'],
};

// A short list of previously-shipped features (from runs/) so the scout has context on
// what already exists in this app. Best-effort — never throws.
function pastSummary() {
  try {
    const shipped = listRuns(ROOT).filter((r) => r.status === 'shipped').slice(0, 10).reverse();
    if (!shipped.length) return '';
    const lines = shipped.map((r) => `- ${r.request}`).join('\n');
    return `\n\nPreviously shipped in this app (most recent last) — avoid duplicating, build on these:\n${lines}`;
  } catch {
    return '';
  }
}

function renderTicket(spec) {
  const ac = (spec.acceptanceCriteria || [])
    .map((a) => `- **${a.id}** — Given ${a.given}, when ${a.when}, then ${a.then}.`).join('\n');
  return `# ${spec.ticketKey || TICKET} — ${spec.title}

**Problem:** ${spec.problem}

**In scope:** ${(spec.scope?.in || []).join('; ')}
**Out of scope:** ${(spec.scope?.out || []).join('; ')}

## Changes
- **Backend:** ${(spec.changes?.backend || []).join(', ')}
- **Frontend:** ${(spec.changes?.frontend || []).join(', ')}
- **Shared:** ${(spec.changes?.shared || []).join(', ')}

## Acceptance criteria
${ac}`;
}

export function makeAgents({ writeArtifact }) {
  // implement/test/pr need the real app checked out + installed; there is no simulated
  // fallback anymore, so fail loudly with a fix-it message if it isn't there.
  const requireApp = () => {
    if (!APP_READY) {
      throw new Error('apps/taskapp/backend is not installed — run `cd apps/taskapp/backend && npm install` (and the frontend) to run implement/test/pr live.');
    }
  };

  // ---- LIVE reasoning/authoring agents --------------------------------------
  const scout = async ({ ledger }) => {
    const md = await runClaude({
      agentPromptPath: 'agents/01-scout.md',
      allowedTools: ['Read', 'Grep', 'Glob'], // read-only exploration of the app — no edits, no plan files
      prompt: `Feature request:\n\n${ledger.request}\n\nProduce a concise impact assessment for this Angular + NestJS task app. The backend lives at apps/taskapp/backend (NestJS, in-memory store). List affected FE/BE/shared surfaces, new artifacts, risks, and open questions. Markdown.${pastSummary()}`,
      cwd: APP,
    });
    writeArtifact('01-impact-assessment.md', md);
    return { ok: true, summary: 'Assessed impact (live claude).', artifact: md };
  };

  const specWriter = async ({ ledger }) => {
    const spec = await runClaude({
      agentPromptPath: 'agents/02-spec-writer.md',
      prompt: `Feature request:\n\n${ledger.request}\n\nImpact assessment:\n${ledger.artifacts.scout}\n\nEmit the structured spec. ticketKey must be "${TICKET}". Acceptance criteria must be testable by Jest against the NestJS backend.`,
      schema: SPEC_SCHEMA,
    });
    spec.ticketKey = spec.ticketKey || TICKET;
    const ticketMd = renderTicket(spec);
    writeArtifact('02-TASK-142-ticket.md', ticketMd);

    let suffix = '';
    if (linearEnabled()) {
      try {
        const issue = await createIssue({ title: `[${spec.ticketKey}] ${spec.title}`, description: ticketMd });
        if (issue) { ledger.linear = issue; suffix = ` · Linear ${issue.identifier} → ${issue.url}`; }
      } catch (e) { suffix = ` · (Linear create failed: ${e.message})`; }
    }
    return { ok: true, summary: `Drafted ${spec.ticketKey} (${(spec.acceptanceCriteria || []).length} ACs, live)${suffix}`, artifact: spec };
  };

  const planner = async ({ ledger }) => {
    const plan = await runClaude({
      agentPromptPath: 'agents/03-planner.md',
      prompt: `Approved spec:\n${JSON.stringify(ledger.artifacts.spec, null, 2)}\n\nProduce the file-level plan as backend/frontend slices. Backend files live under apps/taskapp/backend/src.`,
      schema: PLAN_SCHEMA,
    });
    writeArtifact('03-plan.json', JSON.stringify(plan, null, 2));
    return { ok: true, summary: `Plan: ${(plan.slices || []).length} slices (live).`, artifact: plan };
  };

  const reviewer = async ({ ledger }) => {
    const pr = ledger.artifacts.pr;
    const changes = [
      `IMPLEMENTATION SUMMARY:\n${ledger.artifacts.implement}`,
      `TEST REPORT:\n${ledger.artifacts.test}`,
      `DIFF / PR:\n${pr?.diff || pr}`,
    ].join('\n\n');
    const v = await runClaude({
      agentPromptPath: 'agents/07-reviewer.md',
      prompt: `Spec:\n${JSON.stringify(ledger.artifacts.spec, null, 2)}\n\nChanges under review:\n${changes}\n\nReview against the spec and coding standards. Block ONLY if an acceptance criterion is unmet, an in-scope change (backend OR frontend) is missing, or there is a real standards violation or bug. Record cosmetic/minor concerns as non-blocking findings — do not block on those.`,
      schema: VERDICT_SCHEMA,
    });
    writeArtifact('07-review-verdict.json', JSON.stringify(v, null, 2));
    return { ok: v.verdict === 'pass', summary: `Review ${v.verdict} (${(v.findings || []).length} findings, live).`, artifact: v };
  };

  const closerCurator = async ({ ledger }) => {
    const out = await runClaude({
      agentPromptPath: 'agents/10-closer-curator.md',
      prompt: `Release report:\n${ledger.artifacts.merge_release}\n\nReview verdict:\n${JSON.stringify(ledger.artifacts.review, null, 2)}\n\nIf the review surfaced a generalizable rule, propose a unified-diff update to .knowledge/CLAUDE.md. Otherwise reply "No standards update needed." Output the diff (or that line) only.`,
    });
    writeArtifact('10-standards-update.diff', out);

    let suffix = '';
    if (linearEnabled() && ledger.linear?.id) {
      try {
        await addComment(ledger.linear.id,
          `Pipeline complete ✅\nReview: ${ledger.artifacts.review?.verdict}\nBranch: \`${BRANCH}\`\nArtifacts: runs/${process.env.RUN_ID || ''}/`);
        const state = await markDone(ledger.linear.id);
        suffix = ` · Linear ${ledger.linear.identifier} → ${state || 'commented'}`;
      } catch (e) { suffix = ` · (Linear update failed: ${e.message})`; }
    }
    return { ok: true, summary: `Closed ticket; curated standards (live)${suffix}`, artifact: out };
  };

  // ---- LIVE code agents (only when the backend is installed) ----------------
  const liveImplementer = async ({ ledger, attempt }) => {
    requireApp();
    if (attempt === 1) { await ensureRepo(); await git(['checkout', '-B', BRANCH]); }
    const fix = ledger.testFail
      ? `\n\nThe backend test suite is currently FAILING — fix the implementation. Tail of the output:\n${String(ledger.testFail).slice(-3500)}`
      : '';
    const prior = ledger.artifacts.review;
    const reviewNote = prior && prior.verdict === 'block'
      ? `\n\nA prior code review BLOCKED this change. Address EVERY finding below before finishing:\n${JSON.stringify(prior.findings, null, 2)}`
      : '';
    const summary = await runClaude({
      agentPromptPath: 'agents/04-implementer.md',
      prompt: `Implement this plan FULL-STACK across apps/taskapp — BOTH the NestJS backend (backend/src) AND the Angular frontend (frontend/src). Implement every slice in the plan, reuse one shared priority/type definition per app, keep diffs minimal and idiomatic, and keep the backend build + tests green (run \`npm --prefix backend test\` to check).\n\nPlan:\n${JSON.stringify(ledger.artifacts.plan, null, 2)}${fix}${reviewNote}`,
      cwd: APP,
      allowedTools: TOOLS,
      permissionMode: 'acceptEdits',
    });
    writeArtifact('04-implementation-summary.md', summary);
    return { ok: true, summary: `Implemented full-stack on ${BRANCH} (live, attempt ${attempt}).`, artifact: summary };
  };

  const liveTestAuthor = async ({ ledger }) => {
    requireApp();
    const note = await runClaude({
      agentPromptPath: 'agents/05-test-author.md',
      prompt: `Add or extend Jest specs that verify EACH acceptance criterion, across BOTH stacks: backend specs under backend/src/**/*.spec.ts, and frontend specs under frontend/src/**/*.spec.ts (the frontend uses ts-jest on pure logic — test functions/helpers, not Angular component rendering). Then make sure they pass. Do not weaken existing tests.\n\nSpec:\n${JSON.stringify(ledger.artifacts.spec, null, 2)}`,
      cwd: APP,
      allowedTools: TOOLS,
      permissionMode: 'acceptEdits',
    });
    const t = await npmTest(); // the REAL gate
    const md = `# Test report — ${TICKET} (live)\n\n${note}\n\n---\n\n\`npm test\` → **${t.ok ? 'PASS' : 'FAIL'}**\n\n\`\`\`\n${t.out.slice(-3000)}\n\`\`\``;
    writeArtifact('05-tests-summary.md', md);
    if (t.ok) return { ok: true, summary: 'Tests added; live `npm test` green.', artifact: md };
    ledger.testFail = t.out;
    return { ok: false, summary: 'Live `npm test` FAILED → routing back to implement.', artifact: md };
  };

  const livePrAgent = async ({ ledger }) => {
    requireApp();
    const mode = await ensureRepo();
    let diff;
    if (mode === 'own') {
      await git(['add', '-A']);
      diff = await git(['diff', '--cached']);
    } else {
      // Inside a parent repo: don't touch its index/branch — capture a path-scoped working-tree diff.
      diff = await git(['diff', '--', '.']);
      const untracked = await git(['ls-files', '--others', '--exclude-standard', '--', '.']);
      if (untracked.trim()) diff += `\n\n# New (untracked) files:\n${untracked}`;
    }
    const desc = await runClaude({
      agentPromptPath: 'agents/06-pr-agent.md',
      prompt: `Write a PR description (markdown) for these changes. Reference ${ledger.linear?.identifier || TICKET} and check off each acceptance criterion.\n\nDiff:\n${diff.slice(0, 12000)}`,
      cwd: APP,
    });
    const md = `${desc}\n\n---\n\n## Diff (\`git diff --cached\`)\n\n\`\`\`diff\n${diff.slice(0, 8000)}\n\`\`\``;
    writeArtifact('06-PR-description.md', md);
    return { ok: true, summary: `PR description from real git diff (${diff.split('\n').length} lines).`, artifact: { description: desc, diff } };
  };

  // ---- infra-bound steps — not executed here (need preview env + real CI/CD) ----
  // Honest placeholders: the pipeline shape is unchanged, but nothing is faked as "shipped".
  const previewE2e = async () => {
    const md = `# Preview + E2E — ${TICKET}

_Infra step — not executed in this environment._

A real run would deploy an ephemeral preview environment for the PR branch, run the e2e
suite against it, then block on **human PR approval** (gate 2) before merge.`;
    writeArtifact('08-preview-e2e-report.md', md);
    return { ok: true, summary: 'Preview + E2E skipped (infra step — not executed).', artifact: md };
  };

  const mergeRelease = async () => {
    const md = `# Release — ${TICKET}

_Infra step — not executed in this environment._

A real run would squash-merge the approved PR, deploy to production with an idempotency
key, and run a post-deploy smoke check.`;
    writeArtifact('09-release-report.md', md);
    return { ok: true, summary: 'Merge + release skipped (infra step — not executed).', artifact: md };
  };

  return {
    scout,
    'spec-writer': specWriter,
    planner,
    reviewer,
    'closer-curator': closerCurator,
    implementer: liveImplementer,
    'test-author': liveTestAuthor,
    'pr-agent': livePrAgent,
    'preview-e2e': previewE2e,
    'merge-release': mergeRelease,
  };
}
