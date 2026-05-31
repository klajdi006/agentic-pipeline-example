// Adapter that drives agents through your LOCAL Claude Code CLI (`claude -p`),
// using your existing logged-in subscription — NO ANTHROPIC_API_KEY required.
//
// Why the CLI and not the Agent SDK: the Claude Agent SDK requires an explicit
// API key (Anthropic doesn't allow subscription auth for SDK-built agents). The
// headless CLI in normal mode uses your interactive login, so it's the right tool
// for a LOCAL prototype. (For production / multi-user, move to API-key billing.)

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."); // project root

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
  const args = [
    "-p", finalPrompt,
    "--output-format", "json",
    "--append-system-prompt", systemPrompt(agentPromptPath),
    "--permission-mode", permissionMode,
  ];
  if (allowedTools.length) args.push("--allowedTools", allowedTools.join(","));

  let stdout;
  try {
    ({ stdout } = await exec("claude", args, { cwd: cwd || ROOT, maxBuffer: 64 * 1024 * 1024 }));
  } catch (e) {
    if (e.code === "ENOENT") {
      throw new Error("`claude` CLI not found on PATH. Install Claude Code and run `claude login` first.");
    }
    throw new Error(`claude CLI failed:\n${e.stderr || e.message}`);
  }

  let env;
  try { env = JSON.parse(stdout); } catch { return stdout.trim(); } // some versions print raw text
  if (env.is_error) throw new Error(`claude returned an error: ${env.result ?? stdout}`);
  const result = env.result ?? "";
  if (!schema) return typeof result === "string" ? result : JSON.stringify(result, null, 2);
  return coerceJson(result);
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
