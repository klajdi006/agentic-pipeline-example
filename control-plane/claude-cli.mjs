// Adapter that drives agents through your LOCAL Claude Code CLI (`claude -p`),
// using your existing logged-in subscription — NO ANTHROPIC_API_KEY required.
//
// Why the CLI and not the Agent SDK: the Claude Agent SDK requires an explicit
// API key (Anthropic doesn't allow subscription auth for SDK-built agents). The
// headless CLI in normal mode uses your interactive login, so it's the right tool
// for a LOCAL prototype. (For production / multi-user, move to API-key billing.)

import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."); // project root

// Minimal ANSI palette (matches runner/run.mjs) for the live progress lines.
const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  teal: (s) => `\x1b[36m${s}\x1b[0m`,
  amber: (s) => `\x1b[33m${s}\x1b[0m`,
};
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
// One-line summary of a tool call, e.g. Read(src/app.module.ts) or Bash(npm test).
function toolBrief(name, input = {}) {
  const v = input.file_path || input.path || input.command || input.pattern || input.query || input.url || input.prompt;
  return v ? `${name}(${trunc(String(v).replace(/\s+/g, " ").trim(), 80)})` : name;
}

// --- The living knowledge base, loaded once and reused by every agent. ---------
// Claude Code handles prompt caching for this large, stable prefix automatically.
function loadKnowledge() {
  const parts = [readFileSync(join(ROOT, ".knowledge/CLAUDE.md"), "utf8")];
  for (const dir of ["skills", "decisions"]) {
    const base = join(ROOT, ".knowledge", dir);
    for (const f of readdirSync(base)) parts.push(readFileSync(join(base, f), "utf8"));
  }
  return parts.join("\n\n---\n\n");
}
const KNOWLEDGE = loadKnowledge();

// Per-agent system prompt = knowledge base + that agent's own prompt (agents/*.md),
// passed inline via --append-system-prompt (the `-file` variant isn't on every build).
const sysCache = new Map();
function systemPrompt(agentPromptPath) {
  if (!sysCache.has(agentPromptPath)) {
    const agentPrompt = readFileSync(join(ROOT, agentPromptPath), "utf8");
    sysCache.set(agentPromptPath, `${KNOWLEDGE}\n\n---\n\n${agentPrompt}`);
  }
  return sysCache.get(agentPromptPath);
}

/**
 * Run one agent turn through the local `claude` CLI.
 * @param {object}   o
 * @param {string}   o.prompt           - the user message (task + context)
 * @param {string}   o.agentPromptPath  - path to the agent definition, e.g. "agents/07-reviewer.md"
 * @param {string[]} [o.allowedTools]   - least-privilege tool allowlist (e.g. ["Read","Edit","Bash"])
 * @param {object}   [o.schema]         - JSON Schema → forces structured output, returns a parsed object
 * @param {string}   [o.cwd]            - working dir (a git worktree for implementers); defaults to repo root
 * @param {string}   [o.permissionMode] - "plan" (read-only), "acceptEdits", "bypassPermissions", ...
 * @returns {Promise<string|object>} raw text, or the parsed object when `schema` is given
 */
export async function runClaude({ prompt, agentPromptPath, allowedTools = [], schema, cwd, permissionMode = "plan" }) {
  // Ask for strict JSON in the prompt — more reliable across CLI versions than --json-schema,
  // which returned malformed output (e.g. `{ title }`) on some builds.
  const finalPrompt = schema
    ? `${prompt}\n\nIMPORTANT: Respond with ONLY a single valid JSON object and nothing else — no markdown fences, no commentary. Use double-quoted keys and string values. It must conform to this JSON Schema:\n${JSON.stringify(schema)}`
    : prompt;
  // Stream the agent's work live (tool calls + narration) instead of waiting for the whole
  // turn. We read the CLI's NDJSON event stream — `stream-json` requires `--verbose` in -p mode.
  const args = [
    "-p", finalPrompt,
    "--output-format", "stream-json",
    "--verbose",
    "--append-system-prompt", systemPrompt(agentPromptPath),
    "--permission-mode", permissionMode,
  ];
  if (allowedTools.length) args.push("--allowedTools", allowedTools.join(","));
  if (process.env.CLAUDE_MODEL) args.push("--model", process.env.CLAUDE_MODEL); // e.g. claude-sonnet-4-6

  // Progress lines are indented to sit under the runner's "▶ state" header.
  const say = (line) => process.stdout.write("        " + line + "\n");
  say(c.dim("⋯ claude working…"));

  return await new Promise((resolve, reject) => {
    const child = spawn("claude", args, { cwd: cwd || ROOT });
    let buf = "", resultEnv = null, answer = "", stderr = "";

    child.on("error", (e) =>
      reject(e.code === "ENOENT"
        ? new Error("`claude` CLI not found on PATH. Install Claude Code and run `claude login` first.")
        : e));
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.stdout.on("data", (chunk) => {
      buf += chunk.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        onEvent(line);
      }
    });

    child.on("close", (code) => {
      if (buf.trim()) onEvent(buf); // trailing partial line, if any
      if (resultEnv?.is_error) return reject(new Error(`claude returned an error: ${resultEnv.result ?? ""}`));
      const result = resultEnv?.result ?? answer;
      if (!result && code !== 0) return reject(new Error(`claude CLI failed (exit ${code}):\n${stderr || "no output"}`));
      try {
        if (!schema) return resolve(typeof result === "string" ? result : JSON.stringify(result, null, 2));
        return resolve(coerceJson(result));
      } catch (e) { reject(e); }
    });

    // Translate one NDJSON event into live progress + accumulate the final answer.
    function onEvent(line) {
      const s = line.trim();
      if (!s) return;
      let ev; try { ev = JSON.parse(s); } catch { return; }
      if (ev.type === "result") { resultEnv = ev; return; }
      if (ev.type !== "assistant" || !ev.message?.content) return;
      for (const block of ev.message.content) {
        if (block.type === "tool_use") {
          say(c.teal("→ ") + c.dim(toolBrief(block.name, block.input)));
        } else if (block.type === "text" && block.text?.trim()) {
          answer += (answer ? "\n" : "") + block.text;
          // Preview narration for free-text agents; skip for schema agents (the text is raw JSON).
          if (!schema) {
            for (const l of block.text.trim().split("\n").filter((x) => x.trim()).slice(0, 2)) {
              say(c.dim("✎ " + trunc(l.trim(), 100)));
            }
          }
        }
      }
    }
  });
}

// Structured agents should return JSON. Be tolerant of versions that wrap it in prose or fences.
function coerceJson(result) {
  if (result && typeof result === "object") return result;
  let s = String(result).trim();
  // strip a ```json ... ``` (or bare ```) fence if present
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch { /* fall through */ }
  // last resort: take from the first "{" to the last "}"
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a !== -1 && b > a) {
    try { return JSON.parse(s.slice(a, b + 1)); } catch { /* fall through */ }
  }
  throw new Error("Expected a JSON object from claude but could not parse it. Raw output:\n" + s.slice(0, 1000));
}
