# Curator Feedback Loop — How Standards Self-Correct

The **Closer-Curator** agent reads review findings and proposes updates to the code standards whenever a pattern violation reflects a generalizable rule, not a one-off mistake.

## The Loop

1. **Implementer** writes code against the plan and scoped rules (`.claude/rules/backend.md` or `.claude/rules/frontend.md`)
2. **Reviewer** checks the code against those same rules and emits a verdict with `findings`
3. If the review **blocks** (verdict = `"block"`), the orchestrator routes back to **Implementer** with the findings
4. **Implementer** fixes the violations and re-implements
5. **Reviewer** checks again; if it passes, the pipeline advances to **Closer-Curator**
6. **Closer-Curator** scans the review findings. If a finding reflects a **general architectural pattern** (not a one-off):
   - Maps the violation type to the appropriate rule file:
     - Backend (NestJS): → `.claude/rules/backend.md`
     - Frontend (Angular): → `.claude/rules/frontend.md`
     - Broader: → `.knowledge/CLAUDE.md` or new ADR
   - Proposes a **unified-diff update** that clarifies the rule for next time
   - Submits the update as a small PR for **human approval** (curator doesn't merge silently)
7. **Human** reviews the curator's proposed rule update and approves or rejects
8. If approved, the updated rule **takes effect immediately** for the next pipeline run (Claude Code detects file changes)

## Example: Curator Proposes a Frontend Rule Update

### Scenario: BehaviorSubject in a component

**Implementer** writes:
```typescript
// ❌ In a component (violation)
private taskList = new BehaviorSubject<Task[]>([]);
```

**Reviewer** finds this and blocks with:
```json
{
  "severity": "major",
  "rule": "Use Angular Signals for component state, not BehaviorSubject",
  "file": "apps/taskapp/frontend/src/features/tasks/task-list/task-list.component.ts",
  "message": "Components should use signal() / computed() for local state, not BehaviorSubject. BehaviorSubject is for services that expose state to multiple components."
}
```

**Implementer** fixes it:
```typescript
// ✅ Fixed
private taskList = signal<Task[]>([]);
```

**Reviewer** passes. Pipeline advances to **Closer-Curator**.

**Closer-Curator** reads the findings and sees:
- **Major finding** about BehaviorSubject in components
- **Applies to frontend patterns**
- **This is a pattern**, not a one-off

So it proposes a **unified-diff update** to `.claude/rules/frontend.md`:

```diff
--- a/.claude/rules/frontend.md
+++ b/.claude/rules/frontend.md
@@ -15,6 +15,8 @@
 - Use **Angular Signals** for component local state:
   - `signal()` for mutable state
   - `computed()` for derived state
+  - Never use `BehaviorSubject` for component state
+    - BehaviorSubject is only for services that expose state to multiple consumers
   - Never use `BehaviorSubject` for component state
 - Load async data with `httpResource()` / `resource()` / `toSignal()`.
```

**Human** sees the curator's PR, approves it, and the updated rule is saved. Next time:
- **Implementer** reads `.claude/rules/frontend.md` and sees "Never use `BehaviorSubject` in components"
- **Reviewer** checks against the updated rule
- The pattern is clarified for everyone

## Wiring It Up: What the Curator Receives

The **Closer-Curator** agent receives:
- `ledger.artifacts.review` — the full review verdict including `findings` array
- `ledger.artifacts.merge_release` — the merge/release report

The curator prompt tells it:
1. **Read the findings** and their severity
2. **Identify generalizable patterns** (major/blocker findings that apply broadly)
3. **Map to the right rule file**:
   - Backend (NestJS patterns) → `.claude/rules/backend.md`
   - Frontend (Angular patterns) → `.claude/rules/frontend.md`
   - Cross-cutting → `.knowledge/CLAUDE.md` or new ADR
4. **Propose a unified-diff update** for human approval
5. **Never invent rules** — only propose changes backed by real review feedback

## Testing the Loop

To test the curator feedback loop:

1. **Run the pipeline** with a feature that will get blocked by the reviewer
2. **Implementer** fixes it
3. **Review** passes or fails; if it passes, check the curator output
4. **Look at the artifact**: `runs/<RUN_ID>/10-standards-update.diff`
   - If it says "No standards update needed" → curator didn't find a pattern
   - If it shows a diff → curator proposed a rule update

To **validate the feedback loop**:
- Make an intentional mistake (e.g., use BehaviorSubject in a component)
- Let the review block it
- Fix it in a retry
- Check if the curator proposes a rule update that clarifies the pattern

## Why This Works

- **Feedback is rooted in reality**: The curator only proposes changes that the reviewer actually found
- **No silent edits**: The curator submits its changes as a PR for human approval — standards remain human-governed
- **Automatic effect**: Once approved, updated rules take effect immediately for the next run (Claude Code detects file changes)
- **Prevents rule rot**: Standards evolve as the team discovers new patterns, not as a separate chore
