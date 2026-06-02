// Zero-dependency web UI for the pipeline.
//   node server.mjs   →   open http://localhost:4000
//
// Serves web/index.html, runs `node runner/run.mjs <request>` and streams its output live,
// tees that output into the run's folder (runs/<id>/output.log), and exposes a small API so
// the page can browse past runs.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, existsSync, mkdirSync, createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { makeRunId, runDir, firstLine, listRuns } from "./runner/runs.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4000;
const INDEX = join(__dir, "web", "index.html");

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

      // Pick the run id here so we can tee output to its folder; run.mjs honours RUN_ID.
      const runId = makeRunId(firstLine(request));
      const dir = runDir(__dir, runId);
      mkdirSync(dir, { recursive: true });
      const logStream = createWriteStream(join(dir, "output.log"), { flags: "w" });
      res.write(`\x1b[2m::run ${runId}::\x1b[0m\n`); // surfaced to the client so it can link the run

      const child = spawn(process.execPath, [join(__dir, "runner", "run.mjs"), request], {
        cwd: __dir,
        env: { ...process.env, RUN_ID: runId },
      });
      const pipe = (d) => { res.write(d); logStream.write(d); };
      child.stdout.on("data", pipe);
      child.stderr.on("data", pipe);
      child.on("error", (e) => { pipe(`\n\x1b[31m[failed to start runner: ${e.message}]\x1b[0m\n`); logStream.end(); res.end(); });
      child.on("close", (code) => {
        const tag = code === 0 ? "\x1b[2m" : "\x1b[31m";
        pipe(`\n${tag}[process exited with code ${code}]\x1b[0m\n`);
        logStream.end();
        res.end();
      });
      res.on("close", () => { if (child.exitCode === null) child.kill(); });
    });
    return;
  }

  notFound(res);
});

server.listen(PORT, () => {
  console.log(`\n  🤖 Agentic Pipeline web UI → http://localhost:${PORT}\n`);
});
