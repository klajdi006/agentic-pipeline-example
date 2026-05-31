// The event vocabulary that drives state transitions.
//
// In production these arrive as Linear / GitHub / CI webhooks. The orchestrator is an
// event router: it never polls, it reacts. Listed here so the contract is explicit.

export const EVENTS = Object.freeze({
  FEATURE_REQUESTED: "feature.requested",      // a request lands (Linear, Slack, form)
  SPEC_DRAFTED: "spec.drafted",                // Spec Writer created the ticket
  SPEC_APPROVED: "ticket.approved",            // HUMAN GATE 1 — intent approved
  PLAN_READY: "plan.ready",
  IMPL_DONE: "impl.done",
  TESTS_GREEN: "ci.passed",
  TESTS_RED: "ci.failed",                      // routes back to implement
  PR_OPENED: "pr.opened",
  REVIEW_PASSED: "review.passed",
  REVIEW_BLOCKED: "review.blocked",            // routes back to implement
  PREVIEW_READY: "preview.ready",
  PR_APPROVED: "pr.approved",                  // HUMAN GATE 2 — risk approved
  MERGED: "pr.merged",
  DEPLOYED: "deploy.succeeded",
  DEPLOY_FAILED: "deploy.failed",              // rollback + escalate
  TICKET_CLOSED: "ticket.closed",
});

// Map a raw webhook payload to an internal event. (Stub — real impl validates signatures.)
export function fromWebhook(source, payload) {
  return { source, type: payload.type, ticketKey: payload.ticketKey, at: payload.at };
}
