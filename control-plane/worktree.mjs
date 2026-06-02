// Per-run isolation via `git worktree`. Each pipeline run gets its OWN checkout of
// the repo on its OWN branch, so concurrent runs implement + test in parallel without
// stomping each other's working tree.
//
// Why worktree the whole repo (not just apps/taskapp): the frontend's jest config and
// tsconfig resolve `@taskapp/shared-types` to `<repo>/libs/shared-types/src` via a
// repo-relative path. A full-repo worktree keeps that valid and isolates libs/ too.
//
// node_modules / .env / runs / dist / .angular are gitignored, so a fresh worktree has
// source but no deps — we SYMLINK the main checkout's node_modules in (instant, zero
// disk; the agents only ever write under src/, never into node_modules).

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, symlinkSync } from "node:fs";
import { join, relative } from "node:path";

const exec = promisify(execFile);

// git in a given dir; never throws — returns "" on failure so cleanup stays best-effort.
async function git(cwd, args) {
  try { return (await exec("git", ["-C", cwd, ...args], { maxBuffer: 32 * 1024 * 1024 })).stdout.trim(); }
  catch (e) { return (e.stdout || "") + (e.stderr || e.message || ""); }
}

async function toplevel(dir) {
  try { return (await exec("git", ["-C", dir, "rev-parse", "--show-toplevel"])).stdout.trim(); }
  catch { return ""; }
}

function linkNodeModules(mainAppDir, wtAppDir) {
  for (const pkg of ["backend", "frontend"]) {
    const src = join(mainAppDir, pkg, "node_modules");
    const dest = join(wtAppDir, pkg, "node_modules");
    if (existsSync(src) && !existsSync(dest)) {
      try { symlinkSync(src, dest, "dir"); } catch { /* dep not installed / link race — npm test will report it */ }
    }
  }
}

/**
 * Create an isolated worktree for one run.
 * @returns {Promise<{appDir,backend,frontend,branch,cleanup}>}
 * @throws if there is no git repo to worktree (caller falls back to the main checkout).
 */
export async function createWorktree({ root, appDir, runId }) {
  const top = await toplevel(appDir);
  if (!top) throw new Error("apps/taskapp is not inside a git repo — cannot create an isolated worktree.");

  await git(top, ["worktree", "prune"]); // sweep worktrees orphaned by a previously-killed runner

  const wt = join(top, ".worktrees", runId);
  const branch = `pipeline/${runId}`;
  const rel = relative(top, appDir);            // 'apps/taskapp' (parent repo) or '' (standalone)
  const wtAppDir = rel ? join(wt, rel) : wt;

  // --detach then checkout -B sidesteps both "branch already checked out" and "branch exists".
  const added = await git(top, ["worktree", "add", "--detach", wt]);
  if (!existsSync(wtAppDir)) throw new Error(`git worktree add failed: ${added}`);
  await git(wt, ["checkout", "-B", branch]);

  linkNodeModules(appDir, wtAppDir);

  const cleanup = async () => {
    await git(top, ["worktree", "remove", "--force", wt]); // --force: tree has dist/ + node_modules symlink
    await git(top, ["branch", "-D", branch]);
    await git(top, ["worktree", "prune"]);
  };

  return { appDir: wtAppDir, backend: join(wtAppDir, "backend"), frontend: join(wtAppDir, "frontend"), branch, cleanup };
}
