// Tiny zero-dependency web UI for the pipeline runner.
//   node server.mjs   →   open http://localhost:4000
//
// It serves web/index.html and streams `node runner/run.mjs <request>` live to the
// browser. The runner already prints ANSI-coloured output; the page renders the colours.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4000;
const INDEX = join(__dir, "web", "index.html");

const server = createServer((req, res) => {
  // Serve the page.
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(INDEX)); // re-read each time so edits show up on refresh
    return;
  }

  // Run the pipeline and stream stdout/stderr back as it arrives.
  if (req.method === "POST" && req.url === "/run") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) req.destroy(); // guard against absurd payloads
    });
    req.on("end", () => {
      let request = "";
      try { ({ request = "" } = JSON.parse(body || "{}")); } catch {}

      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-cache",
        "x-accel-buffering": "no", // disable proxy buffering so streaming stays live
      });

      // A feature request is required — there is no default anymore.
      if (!request.trim()) {
        res.end("\x1b[31m✗ Type a feature request first.\x1b[0m\n");
        return;
      }

      // Always live. The runner takes the request as its single CLI arg.
      const child = spawn(process.execPath, [join(__dir, "runner", "run.mjs"), request], { cwd: __dir, env: process.env });

      child.stdout.on("data", (d) => res.write(d));
      child.stderr.on("data", (d) => res.write(d));
      child.on("error", (e) => { res.write(`\n\x1b[31m[failed to start runner: ${e.message}]\x1b[0m\n`); res.end(); });
      child.on("close", (code) => {
        const tag = code === 0 ? "\x1b[2m" : "\x1b[31m";
        res.write(`\n${tag}[process exited with code ${code}]\x1b[0m\n`);
        res.end();
      });

      // If the browser navigates away / hits Stop, kill the child.
      res.on("close", () => { if (child.exitCode === null) child.kill(); });
      return;
    });
    return;
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`\n  🤖 Agentic Pipeline web UI → http://localhost:${PORT}\n`);
});
