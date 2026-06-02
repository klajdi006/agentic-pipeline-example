// The durable runner. In production this is Temporal (or a DB + queue): crash-safe,
// idempotent, resumable. Here it's an in-memory walk of the state machine so the example
// runs offline — but the shape (states, gates, retry routing, ledger) is the real one.

import { STATES as _STATES, START as _START, MAX_ATTEMPTS as _MAX } from "./state-machine.mjs";

export async function runPipeline({ ticketKey, request, agents, approveGate, log, states = _STATES, start = _START, maxAttempts = _MAX }) {
  // `ledger` is the durable state — the only source of truth. A restart would replay from here.
  const ledger = { ticketKey, request, state: start, attempts: {}, artifacts: {}, history: [], escalations: [] };

  while (ledger.state !== "DONE" && ledger.state !== "ESCALATE" && ledger.state !== "ROLLBACK") {
    const stateId = ledger.state;
    const def = states[stateId];
    ledger.attempts[stateId] = (ledger.attempts[stateId] ?? 0) + 1;
    const attempt = ledger.attempts[stateId];

    log.state(stateId, def, attempt);

    // Run the agent for this state. Real impl: an Agent SDK call with this agent's
    // system prompt + .knowledge docs + its scoped tool allowlist.
    const agentFn = agents[def.agent];
    if (!agentFn) throw new Error(`No agent wired for state '${stateId}' (agent '${def.agent}')`);

    const result = await agentFn({ ledger, attempt, log });
    ledger.history.push({ state: stateId, agent: def.agent, attempt, ok: result.ok, summary: result.summary });
    if (result.artifact) ledger.artifacts[stateId] = result.artifact;

    // Failure routing: route back (e.g. red CI, blocked review) until attempts run out.
    if (result.ok === false) {
      const target = def.onFail ?? "ESCALATE";
      log.fail(stateId, result.summary, target);
      // Record every failure-routing so the run's meta.json explains WHY it looped/escalated.
      ledger.escalations.push({ state: stateId, attempt, reason: result.summary, target });
      if (attempt >= maxAttempts) {
        log.escalate(stateId, attempt);
        ledger.escalation = { state: stateId, attempts: attempt, reason: result.summary };
        ledger.state = "ESCALATE";
        break;
      }
      ledger.state = target; // e.g. back to "implement"
      continue;
    }

    // Human gate: nothing leaves this state until a person clears it.
    if (def.gate) {
      log.gate(def.gate);
      const decision = await approveGate(def.gate, ledger);
      log.gateResult(def.gate, decision);
      if (!decision.approved) {
        const reason = `Human gate '${def.gate}' rejected${decision.by ? " by " + decision.by : ""}`;
        ledger.escalations.push({ state: stateId, attempt, reason, target: "ESCALATE" });
        ledger.escalation = { state: stateId, attempts: attempt, reason };
        ledger.state = "ESCALATE";
        break;
      }
    }

    ledger.state = def.next ?? "DONE";
  }

  log.end(ledger.state, ledger);
  return ledger;
}
