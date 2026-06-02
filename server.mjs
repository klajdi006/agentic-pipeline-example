// Zero-dependency web UI for the pipeline.
//   node server.mjs   →   open http://localhost:4000
//
// Serves web/index.html, runs `node runner/run.mjs <request>` and streams its output live,
// tees that output into the run's folder (runs/<id>/output.log), and exposes a small API so
// the page can browse past runs.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, existsSync, mkdirSync, createWriteStream, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { makeRunId, runDir, firstLine, listRuns } from "./runner/runs.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4100;
const INDEX = join(__dir, "web", "index.html");

// Concurrency: runs edit apps/taskapp IN PLACE by default, so they must run one at a time
// (parallel in-place runs would stomp each other). Extra runs queue. To run in parallel,
// start the runner with WORKTREE=1 (isolated per-run checkout) and raise MAX_CONCURRENT_RUNS.
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_RUNS) || 1;
let active = 0;
const queue = [];
const children = new Map(); // runId → child process (for the stop endpoint)

// Start queued runs until the cap is reached. A client that disconnected while waiting
// is skipped (no slot consumed).
function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    const job = queue.shift();
    if (job.res.writableEnded) continue;
    active++;
    startRun(job.request, job.res);
  }
}

function startRun(request, res) {
  const runId = makeRunId(firstLine(request));
  const dir = runDir(__dir, runId);
  mkdirSync(dir, { recursive: true });
  // Stub meta so the run shows up in the sidebar immediately (run.mjs overwrites it with
  // the full record). Without this, an instant /api/runs refresh would find no meta yet.
  writeFileSync(join(dir, "meta.json"),
    JSON.stringify({ id: runId, request: firstLine(request), status: "running", startedAt: new Date().toISOString() }, null, 2));
  const logStream = createWriteStream(join(dir, "output.log"), { flags: "w" });
  res.write(`\x1b[2m::run ${runId}::\x1b[0m\n`); // surfaced to the client so it can link the run

  const child = spawn(process.execPath, [join(__dir, "runner", "run.mjs"), request], {
    cwd: __dir,
    env: { ...process.env, RUN_ID: runId },
  });
  children.set(runId, child);
  // The run always tees to output.log; it streams to the browser only while connected.
  // If the client goes away we keep the run going (fire-and-forget) and just stop writing
  // to the dead response — the run is NOT killed by a dropped connection.
  let clientGone = false;
  const endRes = () => { if (!res.writableEnded) { try { res.end(); } catch { /* already gone */ } } };
  const pipe = (d) => {
    logStream.write(d);
    if (!clientGone && !res.writableEnded) { try { res.write(d); } catch { clientGone = true; } }
  };
  child.stdout.on("data", pipe);
  child.stderr.on("data", pipe);

  let released = false;
  const release = () => { if (released) return; released = true; children.delete(runId); active--; pump(); };

  child.on("error", (e) => { pipe(`\n\x1b[31m[failed to start runner: ${e.message}]\x1b[0m\n`); logStream.end(); endRes(); release(); });
  child.on("close", (code) => {
    const tag = code === 0 ? "\x1b[2m" : "\x1b[31m";
    pipe(`\n${tag}[process exited with code ${code}]\x1b[0m\n`);
    logStream.end();
    endRes();
    release();
  });
  // Client disconnected (tab closed / refreshed / navigated). DON'T kill the run — let it
  // finish; it keeps writing to output.log and you can reattach by clicking it in the
  // sidebar. Stopping is explicit, via the ✕ button (POST /api/runs/<id>/stop).
  res.on("close", () => { clientGone = true; });
  res.on("error", () => { clientGone = true; }); // swallow post-disconnect socket errors
}

const json = (res, obj, code = 200) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" });
  res.end(JSON.stringify(obj));
};
const notFound = (res, msg = "not found") => { res.writeHead(404, { "content-type": "text/plain" }); res.end(msg); };

// Only allow plain path segments — no slashes, no "..".
const safeSeg = (s) => (/^[A-Za-z0-9._-]+$/.test(s) && !s.includes("..") ? s : null);

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;

  // ---- the page ----
  if (req.method === "GET" && (path === "/" || path === "/index.html")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(INDEX)); // re-read each time so edits show up on refresh
    return;
  }

  // ---- run-history API ----
  if (req.method === "GET" && path === "/api/runs") {
    return json(res, listRuns(__dir));
  }
  // POST /api/runs/<id>/stop  → stop an in-flight run (SIGTERM → graceful cleanup in run.mjs)
  let stopM = path.match(/^\/api\/runs\/([^/]+)\/stop$/);
  if (req.method === "POST" && stopM) {
    const id = safeSeg(decodeURIComponent(stopM[1]));
    const child = id && children.get(id);
    if (child && child.exitCode === null) { child.kill("SIGTERM"); return json(res, { stopped: true }); }
    return json(res, { stopped: false, reason: "not running" }, 404);
  }
  // /api/runs/<id>/output  → the saved terminal output (ANSI)
  let m = path.match(/^\/api\/runs\/([^/]+)\/output$/);
  if (req.method === "GET" && m) {
    const id = safeSeg(decodeURIComponent(m[1]));
    const file = id && join(runDir(__dir, id), "output.log");
    if (!file || !existsSync(file)) return notFound(res, "no output for that run");
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" });
    res.end(readFileSync(file));
    return;
  }
  // /api/runs/<id>/artifacts  → list artifact files in that run's folder
  m = path.match(/^\/api\/runs\/([^/]+)\/artifacts$/);
  if (req.method === "GET" && m) {
    const id = safeSeg(decodeURIComponent(m[1]));
    const dir = id && runDir(__dir, id);
    if (!dir || !existsSync(dir)) return notFound(res, "no such run");
    const files = readdirSync(dir).filter((f) => f !== "output.log").sort();
    return json(res, files);
  }
  // /api/runs/<id>/artifact?name=<file>  → raw artifact content
  m = path.match(/^\/api\/runs\/([^/]+)\/artifact$/);
  if (req.method === "GET" && m) {
    const id = safeSeg(decodeURIComponent(m[1]));
    const name = safeSeg(url.searchParams.get("name") || "");
    const file = id && name && join(runDir(__dir, id), name);
    if (!file || !existsSync(file)) return notFound(res, "no such artifact");
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" });
    res.end(readFileSync(file));
    return;
  }

  // ---- start a run, stream output, tee to the run folder ----
  if (req.method === "POST" && path === "/run") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => {
      let request = "";
      try { ({ request = "" } = JSON.parse(body || "{}")); } catch { /* ignore */ }

      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-cache",
        "x-accel-buffering": "no",
      });
      if (!request.trim()) { res.end("\x1b[31m✗ Type a feature request first.\x1b[0m\n"); return; }

      // Queue if we're at the cap; pump() starts it (and streams) when a slot frees.
      if (active >= MAX_CONCURRENT) {
        res.write(`\x1b[2m⏳ queued — ${active} run(s) in progress (cap ${MAX_CONCURRENT})…\x1b[0m\n`);
      }
      queue.push({ request, res });
      pump();
    });
    return;
  }

  notFound(res);
});

server.listen(PORT, () => {
  console.log(`\n  🤖 Agentic Pipeline web UI → http://localhost:${PORT}\n`);
});
