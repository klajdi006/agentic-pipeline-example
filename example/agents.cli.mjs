// LIVE agents — same interface as simulated-agents.mjs.
//
//  • scout, spec-writer, planner, reviewer, closer-curator  → real `claude` calls.
//  • spec-writer / closer-curator                            → create + close a Linear ticket
//                                                               (if LINEAR_API_KEY is set).
//  • implementer, test-author, pr-agent                      → operate on the REAL backend at
//                                                               apps/taskapp/backend IF it's
//                                                               installed (node_modules present);
//                                                               otherwise fall back to simulated.
//  • preview-e2e, merge-release                              → simulated (need preview infra/CI).
//
// `npm test` in the backend is the real CI gate: a red suite returns ok:false and the
// orchestrator routes back to the implementer — exactly the deck's failure loop, for real.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runClaude } from '../control-plane/claude-cli.mjs';
import { makeAgents as makeSimAgents } from './simulated-agents.mjs';
import { createIssue, addComment, markDone, linearEnabled } from '../control-plane/linear.mjs';

const exec = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'apps/taskapp');
const BACKEND = join(APP, 'backend');
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
// Ensure apps/taskapp is its OWN git repo before branching — never touch a parent repo.
async function ensureRepo() {
  let top = '';
  try { top = (await exec('git', ['-C', APP, 'rev-parse', '--show-toplevel'])).stdout.trim(); } catch { /* no repo */ }
  if (top === APP) return;
  await exec('git', ['-C', APP, 'init', '-b', 'main']).catch(() => {});
  await exec('git', ['-C', APP, 'add', '-A']).catch(() => {});
  await exec('git', ['-C', APP, '-c', 'user.email=pipeline@local', '-c', 'user.name=pipeline', 'commit', '-m', 'baseline'], { maxBuffer: 32 * 1024 * 1024 }).catch(() => {});
}

async function npmTest() {
  try {
    const { stdout, stderr } = await exec('npm', ['test', '--silent'], { cwd: BACKEND, maxBuffer: 64 * 1024 * 1024 });
    return { ok: true, out: stdout + stderr };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || e.message) };
  }
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
  const sim = makeSimAgents({ writeArtifact }); // fallbacks for infra-bound / not-installed steps
  if (!APP_READY) {
    console.error('   note: apps/taskapp/backend not installed → implement/test/pr simulated. `cd apps/taskapp/backend && npm install` to go live.');
  }

  // ---- LIVE reasoning/authoring agents --------------------------------------
  const scout = async ({ ledger }) => {
    const md = await runClaude({
      agentPromptPath: 'agents/01-scout.md',
      prompt: `Feature request:\n\n${ledger.request}\n\nProduce a concise impact assessment for this Angular + NestJS task app. The backend lives at apps/taskapp/backend (NestJS, in-memory store). List affected FE/BE/shared surfaces, new artifacts, risks, and open questions. Markdown.`,
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
      prompt: `Spec:\n${JSON.stringify(ledger.artifacts.spec, null, 2)}\n\nChanges under review:\n${changes}\n\nAdversarially review against the coding standards. Default to "block" if a standard is plausibly violated and unverified.`,
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
          `Pipeline complete ✅\nReview: ${ledger.artifacts.review?.verdict}\nBranch: \`${BRANCH}\`\nArtifacts: example/artifacts/`);
        const state = await markDone(ledger.linear.id);
        suffix = ` · Linear ${ledger.linear.identifier} → ${state || 'commented'}`;
      } catch (e) { suffix = ` · (Linear update failed: ${e.message})`; }
    }
    return { ok: true, summary: `Closed ticket; curated standards (live)${suffix}`, artifact: out };
  };

  // ---- LIVE code agents (only when the backend is installed) ----------------
  const liveImplementer = async ({ ledger, attempt }) => {
    if (attempt === 1) { await ensureRepo(); await git(['checkout', '-B', BRANCH]); }
    const fix = ledger.testFail
      ? `\n\nThe test suite is currently FAILING — fix the implementation. Tail of the output:\n${String(ledger.testFail).slice(-3500)}`
      : '';
    const summary = await runClaude({
      agentPromptPath: 'agents/04-implementer.md',
      prompt: `Implement this plan in the NestJS backend (in-memory store — see CLAUDE.md). Edit files under src/, keep the diff minimal and idiomatic, and keep the build green.\n\nPlan:\n${JSON.stringify(ledger.artifacts.plan, null, 2)}${fix}`,
      cwd: BACKEND,
      allowedTools: TOOLS,
      permissionMode: 'acceptEdits',
    });
    writeArtifact('04-implementation-summary.md', summary);
    return { ok: true, summary: `Implemented on ${BRANCH} (live, attempt ${attempt}).`, artifact: summary };
  };

  const liveTestAuthor = async ({ ledger }) => {
    const note = await runClaude({
      agentPromptPath: 'agents/05-test-author.md',
      prompt: `Add or extend Jest specs (src/**/*.spec.ts) that verify EACH acceptance criterion below, then make sure they pass. Do not weaken existing tests.\n\nSpec:\n${JSON.stringify(ledger.artifacts.spec, null, 2)}`,
      cwd: BACKEND,
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
    await git(['add', '-A']);
    const diff = await git(['diff', '--cached']);
    const desc = await runClaude({
      agentPromptPath: 'agents/06-pr-agent.md',
      prompt: `Write a PR description (markdown) for these changes. Reference ${ledger.linear?.identifier || TICKET} and check off each acceptance criterion.\n\nDiff:\n${diff.slice(0, 12000)}`,
      cwd: APP,
    });
    const md = `${desc}\n\n---\n\n## Diff (\`git diff --cached\`)\n\n\`\`\`diff\n${diff.slice(0, 8000)}\n\`\`\``;
    writeArtifact('06-PR-description.md', md);
    return { ok: true, summary: `PR description from real git diff (${diff.split('\n').length} lines).`, artifact: { description: desc, diff } };
  };

  return {
    scout,
    'spec-writer': specWriter,
    planner,
    reviewer,
    'closer-curator': closerCurator,
    implementer: APP_READY ? liveImplementer : sim.implementer,
    'test-author': APP_READY ? liveTestAuthor : sim['test-author'],
    'pr-agent': APP_READY ? livePrAgent : sim['pr-agent'],
    'preview-e2e': sim['preview-e2e'],
    'merge-release': sim['merge-release'],
  };
}
