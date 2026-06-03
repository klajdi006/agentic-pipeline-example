// LIVE agents. Contract per agent: async ({ ledger, attempt, log }) => { ok, summary, artifact }.
//
//  • scout, spec-and-plan, reviewer, closer-curator         → real `claude` calls.
//  • spec-and-plan (spec-writer + planner combined)         → reduce process startup overhead.
//  • spec-and-plan / closer-curator                         → create + close a Linear ticket
//                                                              (if LINEAR_API_KEY is set).
//  • implementer, test-author, pr-agent                     → operate on the REAL backend at
//                                                              apps/taskapp/backend. The app must
//                                                              be installed (node_modules present)
//                                                              or these throw a clear error.
//  • preview-e2e, merge-release                             → inline stubs, NOT executed
//                                                              (need preview infra / real CI/CD).
//
// `npm test` in the backend is the real CI gate: a red suite returns ok:false and the
// orchestrator routes back to the implementer — exactly the deck's failure loop, for real.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runClaude } from '../control-plane/claude-cli.mjs';
import { createIssue, addComment, markDone, linearEnabled } from '../control-plane/linear.mjs';
import { listRuns } from './runs.mjs';

const exec = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_APP = join(ROOT, 'apps/taskapp'); // the main checkout — used when no per-run worktree
const DEFAULT_BRANCH = 'feat/TASK-142-scheduler';

const TOOLS = ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob'];
// Reasoning/authoring agents (spec, plan, review, pr, curate) only need to LOOK at code —
// never to spawn sub-agents (the Agent/Task tool), shell out, or edit. Without this they
// inherit ALL tools and will, e.g., launch a sub-agent just to list files (very slow).
const READONLY_TOOLS = ['Read', 'Grep', 'Glob'];

// npm test for one stack (never throws — returns output for the trace). `cwd`-bound,
// so it works against either the main checkout or a per-run worktree.
async function runTests(cwd, label) {
  try {
    const { stdout, stderr } = await exec('npm', ['test', '--silent'], { cwd, maxBuffer: 64 * 1024 * 1024 });
    return { ok: true, out: `[${label}] PASS\n${stdout}${stderr}` };
  } catch (e) {
    return { ok: false, out: `[${label}] FAIL\n${e.stdout || ''}${e.stderr || e.message}` };
  }
}

// ---- structured-output schemas (trimmed for the CLI's --json-schema) ----------
const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    ticketKey: { type: 'string' },
    title: { type: 'string', description: 'Brutally short title. Max 6 words.' },
    problem: { type: 'string', description: 'Single-sentence technical problem statement.' },
    scope: {
      type: 'object',
      properties: {
        in: {
          type: 'array',
          items: { type: 'string', description: 'Max 3 critical code impacts' },
          maxItems: 3,
        }
      },
      required: ['in']
    },
    acceptanceCriteria: {
      type: 'array',
      description: 'Keep to maximum 1 to 3 strict technical assertions.',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          assertion: { type: 'string', description: 'Direct technical condition. e.g. "POST /tasks returns a 201 with priority field".' }
        },
        required: ['id', 'assertion'],
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

function renderTicket(spec, ticketKey) {
  const ac = (spec.acceptanceCriteria || [])
    .map((a) => `- **${a.id}**: ${a.assertion}`).join('\n');
  return `# ${spec.ticketKey || ticketKey} — ${spec.title}

**Problem:** ${spec.problem}

**Scope In:** ${(spec.scope?.in || []).join('; ')}

## Technical Acceptance Criteria
${ac}`;
}

export function makeAgents({ writeArtifact, workspace }) {
  // All paths are PER-RUN: with a worktree they point at the isolated checkout; without
  // one (single sequential run, or NO_WORKTREE) they fall back to the main checkout — so
  // existing behavior is unchanged when no workspace is supplied.
  const APP = workspace?.appDir ?? DEFAULT_APP;
  const BACKEND = workspace?.backend ?? join(APP, 'backend');
  const FRONTEND = workspace?.frontend ?? join(APP, 'frontend');
  const BRANCH = workspace?.branch ?? DEFAULT_BRANCH;
  const APP_READY = existsSync(join(BACKEND, 'node_modules')); // installed → implement/test go live

  // git in this run's app dir (never throws — returns output for the trace).
  const git = async (args) => {
    try { return (await exec('git', ['-C', APP, ...args], { maxBuffer: 32 * 1024 * 1024 })).stdout; }
    catch (e) { return (e.stdout || '') + (e.stderr || e.message); }
  };
  // Only used on the no-worktree fallback path. 'own' → apps/taskapp is its own repo (safe
  // to branch); 'parent' → it lives inside a parent repo (don't nest/branch — path-scoped diff).
  let repoMode = null;
  const ensureRepo = async () => {
    if (repoMode) return repoMode;
    let top = '';
    try { top = (await exec('git', ['-C', APP, 'rev-parse', '--show-toplevel'])).stdout.trim(); } catch { /* no repo */ }
    if (top && top !== APP) { repoMode = 'parent'; return repoMode; }
    if (top === APP) { repoMode = 'own'; return repoMode; }
    await exec('git', ['-C', APP, 'init', '-b', 'main']).catch(() => {});
    await exec('git', ['-C', APP, 'add', '-A']).catch(() => {});
    await exec('git', ['-C', APP, '-c', 'user.email=pipeline@local', '-c', 'user.name=pipeline', 'commit', '-m', 'baseline'], { maxBuffer: 32 * 1024 * 1024 }).catch(() => {});
    repoMode = 'own';
    return repoMode;
  };
  // The real CI gate — runs BOTH stacks. Frontend is gated only if it's installed.
  const npmTest = async () => {
    const be = await runTests(BACKEND, 'backend');
    const fe = existsSync(join(FRONTEND, 'node_modules'))
      ? await runTests(FRONTEND, 'frontend')
      : { ok: true, out: '[frontend] skipped — run `npm install` in apps/taskapp/frontend to gate the FE' };
    return { ok: be.ok && fe.ok, out: `${be.out}\n\n${fe.out}` };
  };

  // implement/test/pr need the real app checked out + installed; there is no simulated
  // fallback anymore, so fail loudly with a fix-it message if it isn't there.
  const requireApp = () => {
    if (!APP_READY) {
      throw new Error('apps/taskapp/backend is not installed — run `cd apps/taskapp/backend && npm install` (and the frontend) to run implement/test/pr live.');
    }
  };

  // ---- context forwarding ----------------------------------------------------
  // The implementer is a fresh `claude` session that only receives the plan JSON, so it
  // otherwise re-discovers and re-reads the whole repo before editing. Instead, hand it the
  // CURRENT CONTENTS of the files the plan targets — it edits those in place and only reads
  // more if it must. Big latency win (fewer tool round-trips) and fewer review-block loops.
  const FILE_CAP = 8000, TOTAL_CAP = 40000; // chars: ~10k tokens, cheap vs many Read turns
  const planFiles = (plan) => {
    const seen = new Set();
    for (const s of plan?.slices || []) for (const st of s?.steps || []) for (const f of st?.files || [])
      if (typeof f === 'string' && f.trim()) seen.add(f.trim());
    return [...seen];
  };
  // Plan paths vary ("backend/src/x.ts", "apps/taskapp/backend/...", "libs/..."); try a few bases.
  const resolveFile = (f) => {
    const stripped = f.replace(/^\.?\//, '').replace(/^apps\/taskapp\//, '');
    for (const p of [join(APP, stripped), join(APP, f), join(APP, '..', f), join(APP, '..', '..', f)])
      try { if (statSync(p).isFile()) return p; } catch { /* not at this base */ }
    return null;
  };
  const inScopeContext = (plan) => {
    const files = planFiles(plan);
    if (!files.length) return '';
    const existing = [], toCreate = [];
    let budget = TOTAL_CAP;
    for (const f of files) {
      const p = resolveFile(f);
      if (!p) { toCreate.push(f); continue; }
      if (budget <= 0) { existing.push(`--- ${f} ---\n(omitted to stay within context budget — Read it if needed)`); continue; }
      let body = readFileSync(p, 'utf8');
      if (body.length > FILE_CAP) body = body.slice(0, FILE_CAP) + '\n…(truncated — Read the full file if needed)';
      budget -= body.length;
      existing.push(`--- ${f} ---\n${body}`);
    }
    const parts = [];
    if (existing.length) parts.push(`Current contents of the in-scope files (edit these in place — you do NOT need to Read them again):\n\n${existing.join('\n\n')}`);
    if (toCreate.length) parts.push(`New files the plan introduces (create these):\n${toCreate.map((f) => `- ${f}`).join('\n')}`);
    return parts.length ? `\n\n${parts.join('\n\n')}` : '';
  };

  // ---- LIVE reasoning/authoring agents --------------------------------------
  const SCOUT_ROOTS = [
    { base: APP,  dir: 'backend/src' },
    { base: APP,  dir: 'frontend/src/app' },
    { base: ROOT, dir: 'libs' },
  ].filter(({ base, dir }) => existsSync(join(base, dir)));

  const scout = async ({ ledger }) => {
    // Pre-load relevant files in Node.js (milliseconds) so Claude gets context
    // without any Grep/Glob round-trips. Tools restricted to Read-only fallback.
    const ctx = await preloadContext(ledger.request, SCOUT_ROOTS);
    const md = await runClaude({
      agentPromptPath: 'agents/01-scout.md',
      allowedTools: ['Read'], // no Grep/Glob — files are pre-loaded; Read only as fallback
      prompt: `Feature request:\n\n${ledger.request}\n\nProduce a concise impact assessment: affected files (BE/FE/shared), new artifacts needed, risks, open questions. Markdown.${ctx}${pastSummary()}`,
      cwd: APP,
    });
    writeArtifact('01-impact-assessment.md', md);
    return { ok: true, summary: 'Assessed impact.', artifact: md };
  };

  const SPEC_ROOTS = [
    { base: APP,  dir: 'backend/src' },
    { base: ROOT, dir: 'libs' },
  ].filter(({ base, dir }) => existsSync(join(base, dir)));

  const specAndPlan = async ({ ledger }) => {
    // Combined spec-writer + planner: reduces process startup overhead by running both
    // in the same orchestration state. Pre-load files once for both agents.
    const ctx = await preloadContext(ledger.request, SPEC_ROOTS);

    // Step 1: Write spec
    const spec = await runClaude({
      agentPromptPath: 'agents/02-spec-writer.md',
      prompt: `Feature request:\n\n${ledger.request}\n\nEmit the structured spec. ticketKey must be "${ledger.ticketKey}". Acceptance criteria must be testable by Jest against the NestJS backend.\n\nIMPORTANT — scope-match the spec to the request. A small change should have just 1–3 acceptance criteria and a tiny scope. Do NOT invent extra features, edge cases, validation, or refactors the request didn't ask for.${ctx}`,
      allowedTools: READONLY_TOOLS,
      schema: SPEC_SCHEMA,
    });
    spec.ticketKey = spec.ticketKey || ledger.ticketKey;
    const ticketMd = renderTicket(spec, ledger.ticketKey);
    writeArtifact('02-ticket.md', ticketMd);

    // Create Linear ticket if enabled
    let suffix = '';
    if (linearEnabled()) {
      try {
        const issue = await createIssue({ title: `[${spec.ticketKey}] ${spec.title}`, description: ticketMd });
        if (issue) { ledger.linear = issue; suffix = ` · Linear ${issue.identifier}`; }
      } catch (e) { suffix = ` · (Linear create failed: ${e.message})`; }
    }

    // Step 2: Plan (informed by spec)
    const plan = await runClaude({
      agentPromptPath: 'agents/03-planner.md',
      prompt: `Approved spec:\n${JSON.stringify(spec, null, 2)}\n\nProduce the SMALLEST file-level plan that satisfies the spec, as backend/frontend slices. Backend files live under apps/taskapp/backend/src. Touch only the files that genuinely must change — a single-field change is typically ~2–5 file touches. Do NOT add steps for refactors, new abstractions, or files the spec doesn't require.`,
      allowedTools: READONLY_TOOLS,
      schema: PLAN_SCHEMA,
    });
    writeArtifact('03-plan.json', JSON.stringify(plan, null, 2));

    // Store both artifacts for downstream agents
    ledger.artifacts = ledger.artifacts || {};
    ledger.artifacts.spec = spec;
    ledger.artifacts.plan = plan;

    return {
      ok: true,
      summary: `Drafted ${spec.ticketKey} (${(spec.acceptanceCriteria || []).length} ACs) + plan (${(plan.slices || []).length} slices)${suffix}`,
      artifact: { spec, plan }
    };
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
      prompt: `Spec:\n${JSON.stringify(ledger.artifacts.spec, null, 2)}\n\nChanges under review:\n${changes}\n\nReview against the spec. DEFAULT TO PASS. Set verdict "block" ONLY for a genuinely unmet acceptance criterion, a missing in-scope change, or a real bug/security defect that breaks the feature. Do NOT block on style, naming, structure, extra test coverage, or "could be improved" — record those as non-blocking findings and PASS. If you're unsure, pass.`,
      allowedTools: READONLY_TOOLS,
      schema: VERDICT_SCHEMA,
    });
    writeArtifact('07-review-verdict.json', JSON.stringify(v, null, 2));
    return { ok: v.verdict === 'pass', summary: `Review ${v.verdict} (${(v.findings || []).length} findings, live).`, artifact: v };
  };

  const closerCurator = async ({ ledger }) => {
    const out = await runClaude({
      agentPromptPath: 'agents/10-closer-curator.md',
      prompt: `Release report:\n${ledger.artifacts.merge_release}\n\nReview verdict:\n${JSON.stringify(ledger.artifacts.review, null, 2)}\n\nIf the review surfaced a generalizable rule, propose a unified-diff update to .knowledge/CLAUDE.md. Otherwise reply "No standards update needed." Output the diff (or that line) only.`,
      allowedTools: READONLY_TOOLS,
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
    // Worktree mode already created the branch. In-place mode: branch ONLY if apps/taskapp is
    // its own standalone repo (safe). If it lives inside a parent repo, edit on the current
    // branch and leave the user's git untouched — the changes just show up in `git status`.
    if (attempt === 1 && !workspace && (await ensureRepo()) === 'own') { await git(['checkout', '-B', BRANCH]); }
    const fix = ledger.testFail
      ? `\n\nThe backend test suite is currently FAILING — fix the implementation. Tail of the output:\n${String(ledger.testFail).slice(-3500)}`
      : '';
    const prior = ledger.artifacts.review;
    const reviewNote = prior && prior.verdict === 'block'
      ? `\n\nA prior code review BLOCKED this change. Address EVERY finding below before finishing:\n${JSON.stringify(prior.findings, null, 2)}`
      : '';
    // Forward the acceptance criteria + the current in-scope file contents so the agent
    // implements to spec and edits in place instead of re-reading the repo.
    const ac = ledger.artifacts.spec?.acceptanceCriteria || [];
    const specNote = ac.length
      ? `\n\nAcceptance criteria to satisfy:\n${ac.map((a) => `- ${a.id}: given ${a.given}, when ${a.when}, then ${a.then}`).join('\n')}`
      : '';
    const scopeCtx = inScopeContext(ledger.artifacts.plan);
    const summary = await runClaude({
      agentPromptPath: 'agents/04-implementer.md',
      prompt: `Implement this plan FULL-STACK across apps/taskapp — BOTH the NestJS backend (backend/src) AND the Angular frontend (frontend/src). The current contents of every in-scope file are included below, so edit them directly and DO NOT re-read the whole repo — only Read a file that isn't provided if you genuinely need it. Implement every slice in the plan, reuse one shared priority/type definition per app, and keep the backend build + tests green (run \`npm --prefix backend test\` to check). Make the SMALLEST change that satisfies the spec — do NOT refactor unrelated code or add features/abstractions the plan doesn't call for.\n\nPlan:\n${JSON.stringify(ledger.artifacts.plan, null, 2)}${specNote}${scopeCtx}${fix}${reviewNote}`,
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
      prompt: `Add or extend Jest specs that verify EACH acceptance criterion. You MUST add at least one new it(...) block — if you write zero new test cases, return ok:false. Backend specs: backend/src/**/*.spec.ts (supertest for HTTP). Frontend specs: frontend/src/**/*.spec.ts (ts-jest on pure logic only). Run the suite and report pass/fail honestly. Do not weaken existing tests.\n\nSpec:\n${JSON.stringify(ledger.artifacts.spec, null, 2)}`,
      cwd: APP,
      allowedTools: TOOLS,
      permissionMode: 'acceptEdits',
    });
    const t = await npmTest(); // the REAL gate
    const md = `# Test report — ${ledger.ticketKey} (live)\n\n${note}\n\n---\n\n\`npm test\` → **${t.ok ? 'PASS' : 'FAIL'}**\n\n\`\`\`\n${t.out.slice(-3000)}\n\`\`\``;
    writeArtifact('05-tests-summary.md', md);
    if (t.ok) return { ok: true, summary: 'Tests added; live `npm test` green.', artifact: md };
    ledger.testFail = t.out;
    return { ok: false, summary: 'Live `npm test` FAILED → routing back to implement.', artifact: md };
  };

  const livePrAgent = async ({ ledger }) => {
    requireApp();
    let diff;
    if (workspace || (await ensureRepo()) === 'own') {
      // Worktree (own branch) or standalone repo: stage everything and diff the index.
      await git(['add', '-A']);
      diff = await git(['diff', '--cached']);
    } else {
      // Fallback inside a parent repo: don't touch its index/branch — path-scoped working-tree diff.
      diff = await git(['diff', '--', '.']);
      const untracked = await git(['ls-files', '--others', '--exclude-standard', '--', '.']);
      if (untracked.trim()) diff += `\n\n# New (untracked) files:\n${untracked}`;
    }
    const desc = await runClaude({
      agentPromptPath: 'agents/06-pr-agent.md',
      prompt: `Write a PR description (markdown) for these changes. Reference ${ledger.linear?.identifier || ledger.ticketKey} and check off each acceptance criterion.\n\nDiff:\n${diff.slice(0, 12000)}`,
      allowedTools: READONLY_TOOLS,
      cwd: APP,
    });
    const md = `${desc}\n\n---\n\n## Diff (\`git diff --cached\`)\n\n\`\`\`diff\n${diff.slice(0, 8000)}\n\`\`\``;
    writeArtifact('06-PR-description.md', md);
    return { ok: true, summary: `PR description from real git diff (${diff.split('\n').length} lines).`, artifact: { description: desc, diff } };
  };

  // Pre-load source files relevant to the request so agents never need to search —
  // they just edit/analyse. Driven by keyword extraction, not a plan.
  // `roots` is an array of { base: absolutePath, dir: relativeSubdir } pairs to search.
  const STOP_WORDS = new Set(['with','that','this','from','into','have','will','make','also','just','add','the','for','its','can','it']);
  const preloadContext = async (request, roots = [{ base: APP, dir: 'backend/src' }]) => {
    const keywords = [...new Set(
      request.toLowerCase().split(/\W+/)
        .filter(w => w.length > 3 && !STOP_WORDS.has(w))
    )].slice(0, 4);
    if (!keywords.length) return '';

    // { abs, label } where label is the display path shown in the prompt block header
    const seen = new Map(); // abs → label
    for (const kw of keywords) {
      for (const { base, dir } of roots) {
        try {
          const { stdout } = await exec('grep', [
            '-r', '-l', kw, '--include=*.ts', '-i',
            '--exclude-dir=node_modules', '--exclude-dir=dist', '--exclude-dir=.angular',
            dir,
          ], { cwd: base, maxBuffer: 1024 * 1024 });
          stdout.trim().split('\n').filter(Boolean).forEach(rel => {
            const abs = join(base, rel);
            if (!seen.has(abs)) seen.set(abs, rel);
          });
        } catch { /* no matches */ }
      }
    }

    let budget = TOTAL_CAP;
    const blocks = [];
    for (const [abs, label] of seen) {
      if (budget <= 0) { blocks.push(`--- ${label} ---\n(budget reached — Read if needed)`); continue; }
      try {
        let body = readFileSync(abs, 'utf8');
        if (body.length > FILE_CAP) body = body.slice(0, FILE_CAP) + '\n…(truncated)';
        budget -= body.length;
        blocks.push(`--- ${label} ---\n${body}`);
      } catch { /* skip unreadable */ }
    }
    return blocks.length
      ? `\n\nRelevant files — read these directly, no need to Grep or Read from disk:\n\n${blocks.join('\n\n')}`
      : '';
  };

  // ---- FAST PATH: single combined implement+test call (trivial changes) --------
  // Files are pre-loaded from disk (Node.js grep, zero Claude calls), so the agent
  // goes straight to editing — same as answering from memory, no discovery round-trips.
  const FAST_TOOLS = ['Read', 'Edit', 'Write', 'Bash']; // no Glob — prevents node_modules traversal
  const fastImplementer = async ({ ledger, attempt }) => {
    requireApp();
    if (attempt === 1 && !workspace && (await ensureRepo()) === 'own') { await git(['checkout', '-B', BRANCH]); }
    const ctx = await preloadContext(ledger.request);
    const failNote = ledger.testFail
      ? `\n\nThe test suite is FAILING — fix it:\n${String(ledger.testFail).slice(-2000)}`
      : '';
    const summary = await runClaude({
      agentPromptPath: 'agents/00-fast.md',
      prompt: `Request: ${ledger.request}\n\nBackend: ${BACKEND} (NestJS/TypeScript, Jest)\nFrontend: ${FRONTEND} (Angular/TypeScript, ts-jest)${ctx}\n\nMake the minimal change and write one new test. The files above are current — edit them directly.${failNote}`,
      cwd: APP,
      allowedTools: FAST_TOOLS,
      permissionMode: 'acceptEdits',
      skipKnowledge: true,
    });
    writeArtifact('04-implementation-summary.md', summary);
    const t = await npmTest();
    const md = `# Fast implementation — ${ledger.ticketKey} (attempt ${attempt})\n\n${summary}\n\n---\n\n\`npm test\` → **${t.ok ? 'PASS' : 'FAIL'}**\n\n\`\`\`\n${t.out.slice(-2000)}\n\`\`\``;
    writeArtifact('05-tests-summary.md', md);
    if (t.ok) return { ok: true, summary: `Fast path: implemented + tested (attempt ${attempt}).`, artifact: md };
    ledger.testFail = t.out;
    return { ok: false, summary: 'Fast path: npm test FAILED → retrying.', artifact: md };
  };

  // ---- infra-bound steps — not executed here (need preview env + real CI/CD) ----
  // Honest placeholders: the pipeline shape is unchanged, but nothing is faked as "shipped".
  const previewE2e = async ({ ledger }) => {
    const md = `# Preview + E2E — ${ledger.ticketKey}

_Infra step — not executed in this environment._

A real run would deploy an ephemeral preview environment for the PR branch, run the e2e
suite against it, then block on **human PR approval** (gate 2) before merge.`;
    writeArtifact('08-preview-e2e-report.md', md);
    return { ok: true, summary: 'Preview + E2E skipped (infra step — not executed).', artifact: md };
  };

  const mergeRelease = async ({ ledger }) => {
    const md = `# Release — ${ledger.ticketKey}

_Infra step — not executed in this environment._

A real run would squash-merge the approved PR, deploy to production with an idempotency
key, and run a post-deploy smoke check.`;
    writeArtifact('09-release-report.md', md);
    return { ok: true, summary: 'Merge + release skipped (infra step — not executed).', artifact: md };
  };

  return {
    scout,
    'spec-and-plan': specAndPlan,
    reviewer,
    'closer-curator': closerCurator,
    implementer: liveImplementer,
    'test-author': liveTestAuthor,
    'pr-agent': livePrAgent,
    'preview-e2e': previewE2e,
    'merge-release': mergeRelease,
    'fast-implementer': fastImplementer,
  };
}
