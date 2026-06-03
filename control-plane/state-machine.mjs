// The deterministic pipeline as a state machine.
//
// Each state names the agent that executes it, an optional human gate that must clear
// before leaving it, where to go on success, and where to route on failure. The
// orchestrator walks this graph — the intelligence lives in the agents, the reliability
// lives here.

export const STATES = Object.freeze({
  spec_and_plan: { agent: "spec-and-plan",   gate: "human-approve-spec",  next: "implement" },
  implement:     { agent: "implementer",     gate: null,                  next: "test",          isolation: "worktree" },
  test:          { agent: "test-author",     gate: null,                  next: "pr",            onFail: "implement" },
  pr:            { agent: "pr-agent",        gate: null,                  next: "review" },
  review:        { agent: "reviewer",        gate: null,                  next: "preview_e2e",   onFail: "implement" },
  preview_e2e:   { agent: "preview-e2e",     gate: "human-approve-pr",    next: "merge_release", onFail: "implement" },
  merge_release: { agent: "merge-release",   gate: null,                  next: "close_curate",  onFail: "ROLLBACK" },
  close_curate:  { agent: "closer-curator",  gate: null,                  next: "DONE" },
});

export const START = "spec_and_plan";

// Retry policy: how many times a failing state may route back before escalating to a human.
export const MAX_ATTEMPTS = 3;

export function nextState(stateId) {
  return STATES[stateId]?.next ?? "DONE";
}

export function failState(stateId) {
  return STATES[stateId]?.onFail ?? "ESCALATE";
}

// ---- Fast path: trivial changes (single field / rename / type change) ----------
// Skips scout/spec/plan/pr/review/curate — implement+test in one Claude call.
export const FAST_STATES = Object.freeze({
  fast_implement: { agent: "fast-implementer", gate: null, next: "DONE", onFail: "fast_implement" },
});
export const FAST_START = "fast_implement";
export const FAST_MAX_ATTEMPTS = 2;
