# TaskApp — the reference product

The small Angular + NestJS app the agentic pipeline builds features into.

- **`backend/`** — NestJS, **runnable + testable** (in-memory store, Jest). This is where the
  implementer/test agents do real work, and where `npm test` is the real CI gate.
- **`frontend/`** — runnable Angular v21 standalone workspace. `npm install` then `npm start`
  (`ng serve`) → http://localhost:4200. Pure logic is unit-tested with **ts-jest** (`npm test`),
  so the frontend has a real CI gate too — no browser/TestBed needed.

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
