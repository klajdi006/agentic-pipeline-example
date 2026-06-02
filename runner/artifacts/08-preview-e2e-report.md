# Preview + E2E — TASK-142

_Infra step — not executed in this environment._

A real run would deploy an ephemeral preview environment for the PR branch, run the e2e
suite against it, then block on **human PR approval** (gate 2) before merge.