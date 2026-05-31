# TaskApp — the reference product

The small Angular + NestJS app the agentic pipeline builds features into.

- **`backend/`** — NestJS, **runnable + testable** (in-memory store, Jest). This is where the
  implementer/test agents do real work, and where `npm test` is the real CI gate.
- **`frontend/`** — Angular standalone source skeleton (idiomatic files; wire into an `ng`
  workspace to run a dev server).

## Backend — the same tests the agents run

```bash
cd backend
npm install
npm test        # Jest
npm run build   # tsc
```

Once `backend/node_modules` exists, the pipeline's **implementer** and **test-author** agents
go LIVE automatically — they edit this code with your local `claude` and gate on real
`npm test` results. See `../../README.md` → "Run against your local Claude Code".
