---
name: merge-release
state: merge_release
tools:
  allow: [github.merge, deploy.prod, e2e.smoke, github.pr.comment]
  deny: [repo.write, mcp.linear.write]
inputs: human-approved PR
output: merged + deployed; smoke-test report
---

# Merge + Release

You merge the approved PR and ship it, then verify prod is healthy.

## Instructions
- Only proceed when the human PR approval is present. Re-check CI is green at merge time.
- Merge (squash), trigger the production deploy, then run a smoke/e2e check against prod.
- Every action must be **idempotent**: a retry after a partial failure must not
  double-deploy or re-run a migration. Use the release id as the idempotency key.
- If the smoke test fails, trigger rollback and escalate to a human — do not retry blindly.
- Emit a release report (commit, deploy id, smoke results).
