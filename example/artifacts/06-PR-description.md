Here's the PR description (markdown) for these changes:

---

# Add Priorities CRUD (FE + BE)

Closes **KLA-6**.

## What & why

Adds a first-class **Priority** resource so tasks can be ranked. This delivers the full CRUD slice end to end: a thin NestJS module backed by an in-memory store, and a standalone Angular feature (list / create / edit) consuming it through a typed API service. No new infrastructure — the store is an in-memory `Map`, consistent with the reference app's dependency-free posture (see `CLAUDE.md`).

## Changes

### Backend — `backend/src/priorities/`
- **`priorities.module.ts`** — declares the controller + service, exports the service; registered in `app.module.ts`.
- **`priorities.controller.ts`** — thin REST controller: `POST /priorities`, `GET /priorities`, `GET /priorities/:id`, `PATCH /priorities/:id`, `DELETE /priorities/:id` (returns `{ ok: true }`).
- **`priorities.service.ts`** — business logic over an in-memory `Map`; throws `NotFoundException` on missing ids; `update` merges only provided fields.
- **`dto/create-priority.dto.ts`**, **`dto/update-priority.dto.ts`** — `class-validator` DTOs (`name`: non-empty, ≤100 chars; `level`: integer ≥ 0; all optional on update).
- **`entities/priority.model.ts`** — in-memory record; `createdAt` stored as a UTC ISO-8601 string.

### Frontend — `frontend/src/app/`
- **`core/api/priorities.service.ts`** — typed `PrioritiesApiService` (the only place `HttpClient` is touched), returning `@taskapp/shared-types` contracts.
- **`features/priorities/priority-list / priority-create / priority-edit`** — standalone, `OnPush` components using `signal()` for state and typed reactive forms.
- **`features/priorities/priority.logic.ts`** — pure, framework-free validation + list helpers mirroring the backend DTO rules (client/server parity), unit-tested without TestBed.
- **`shared/tz-date.pipe.ts`** — `TzDatePipe` renders UTC timestamps in the user's timezone via `Intl.DateTimeFormat`.
- **`app.routes.ts`** — lazy `loadComponent` routes for list / new / `:id`, default redirect to `/priorities`; wired in `app.config.ts` and `app.component.ts`.

### Conventions followed
- Controllers thin, logic in the service; all boundaries DTO-validated.
- Errors via `HttpException` subclasses (`NotFoundException` / `BadRequestException` from `ValidationPipe`).
- Times are UTC ISO-8601; dates rendered via `TzDatePipe`.
- Components are standalone + `OnPush`, signals for state, no direct `HttpClient`.

> Note: storage is in-memory, so no migration is required (per `CLAUDE.md`).

## Acceptance criteria

- [x] **AC1** — `POST` with a valid payload returns the created priority with a generated id, the submitted fields, and a UTC ISO-8601 `createdAt`.
- [x] **AC2** — an invalid create payload is rejected with **400** and nothing is persisted.
- [x] **AC3** — `GET /priorities` returns every stored priority.
- [x] **AC4** — `GET /priorities/:id` returns the matching priority.
- [x] **AC5** — get / update / delete against an unknown id all respond **404** with no side effects.
- [x] **AC6** — `PATCH` with a valid payload reflects the change and preserves unchanged fields (`id`, `createdAt`, and any field not sent).
- [x] **AC7** — an invalid update is rejected with **400** and the stored priority is unchanged.
- [x] **AC8** — `DELETE` removes the priority; a later `GET` responds **404**.

## How verified
- **BE unit** — `priorities.service.spec.ts` covers create/list/get/update/remove and not-found paths.
- **BE controller** — `priorities.controller.spec.ts` maps AC1–AC8 through the controller with a real `ValidationPipe` (HTTP-status semantics verified in-process).
- **BE e2e** — `test/priorities.e2e-spec.ts` exercises the routes via supertest.
- **FE** — `priority.logic.spec.ts` (pure validation/merge/remove) plus component specs for list / create / edit.

## Out of scope
- Persistent storage / migrations (store is in-memory).
- Assigning priorities to tasks (separate follow-up).

---

Two notes worth flagging before this goes up:

1. **The AC list is reverse-engineered from the tests** (`priorities.controller.spec.ts` AC1–AC8), not from KLA-6 itself — I couldn't read the ticket since Linear isn't authenticated this session. If you want me to verify the checklist against KLA-6's actual criteria, I can kick off the Linear OAuth flow.
2. **Branch/ticket mismatch:** the branch is `feat/TASK-142-scheduler` and the diff comments reference `TASK-142`, but this code is the Priorities feature and you asked to reference **KLA-6**. Worth confirming KLA-6 is the right ticket (and possibly renaming the branch) before opening the PR.

I've saved the description to the plan file. Per the PR-agent role I won't create/merge the PR — let me know if you'd like me to proceed with `gh pr create` using this body once the ticket reference is confirmed.

---

## Diff (`git diff --cached`)

```diff
diff --git a/backend/src/app.module.ts b/backend/src/app.module.ts
index 28e8b22..41d8464 100644
--- a/backend/src/app.module.ts
+++ b/backend/src/app.module.ts
@@ -1,7 +1,8 @@
 import { Module } from '@nestjs/common';
+import { PrioritiesModule } from './priorities/priorities.module';
 import { TasksModule } from './tasks/tasks.module';
 
 @Module({
-  imports: [TasksModule],
+  imports: [TasksModule, PrioritiesModule],
 })
 export class AppModule {}
diff --git a/backend/src/priorities/dto/create-priority.dto.ts b/backend/src/priorities/dto/create-priority.dto.ts
new file mode 100644
index 0000000..73ce6d9
--- /dev/null
+++ b/backend/src/priorities/dto/create-priority.dto.ts
@@ -0,0 +1,12 @@
+import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';
+
+export class CreatePriorityDto {
+  @IsString()
+  @IsNotEmpty()
+  @MaxLength(100)
+  name!: string;
+
+  @IsInt()
+  @Min(0)
+  level!: number;
+}
diff --git a/backend/src/priorities/dto/update-priority.dto.ts b/backend/src/priorities/dto/update-priority.dto.ts
new file mode 100644
index 0000000..6b5c619
--- /dev/null
+++ b/backend/src/priorities/dto/update-priority.dto.ts
@@ -0,0 +1,15 @@
+import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
+
+/** Every field is optional — only the provided fields are updated. */
+export class UpdatePriorityDto {
+  @IsOptional()
+  @IsString()
+  @IsNotEmpty()
+  @MaxLength(100)
+  name?: string;
+
+  @IsOptional()
+  @IsInt()
+  @Min(0)
+  level?: number;
+}
diff --git a/backend/src/priorities/entities/priority.model.ts b/backend/src/priorities/entities/priority.model.ts
new file mode 100644
index 0000000..cccf9f2
--- /dev/null
+++ b/backend/src/priorities/entities/priority.model.ts
@@ -0,0 +1,15 @@
+/**
+ * In-memory Priority record for the priorities resource.
+ *
+ * Mirrors the canonical `Priority` contract in `libs/shared-types` (kept self-contained
+ * here, like `tasks/task.model.ts`, so the backend builds without reaching outside its
+ * own `src/` tree). `createdAt` is a UTC ISO-8601 string — never local time (see CLAUDE.md).
+ */
+export interface Priority {
+  id: string;
+  name: string;
+  /** Numeric rank (lower = higher priority). */
+  level: number;
+  /** UTC ISO-8601 timestamp. */
+  createdAt: string;
+}
diff --git a/backend/src/priorities/priorities.controller.spec.ts b/backend/src/priorities/priorities.controller.spec.ts
new file mode 100644
index 0000000..b04529b
--- /dev/null
+++ b/backend/src/priorities/priorities.controller.spec.ts
@@ -0,0 +1,113 @@
+import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
+import { Test } from '@nestjs/testing';
+import { CreatePriorityDto } from './dto/create-priority.dto';
+import { UpdatePriorityDto } from './dto/update-priority.dto';
+import { PrioritiesController } from './priorities.controller';
+import { PrioritiesService } from './priorities.service';
+
+/**
+ * Controller-level spec for the priorities resource.
+ *
+ * Unlike `priorities.e2e-spec.ts` (which lives outside the unit `rootDir` and needs
+ * `supertest`), this runs in-process with the standard `npm test` toolchain. It exercises
+ * each acceptance criterion of TASK-142 through the controller + a real `ValidationPipe`,
+ * so the HTTP-status semantics are verified without a running server:
+ *   - `ValidationPipe` rejects bad input with `BadRequestException` (HTTP 400)
+ *   - `NotFoundException` (HTTP 404) is thrown for unknown ids
+ */
+describe('PrioritiesController', () => {
+  let controller: PrioritiesController;
+  let service: PrioritiesService;
+  // Mirrors the global pipe registered in main.ts / the e2e bootstrap.
+  const pipe = new ValidationPipe({ whitelist: true, transform: true });
+
+  beforeEach(async () => {
+    const moduleRef = await Test.createTestingModule({
+      controllers: [PrioritiesController],
+      providers: [PrioritiesService],
+    }).compile();
+
+    controller = moduleRef.get(PrioritiesController);
+    service = moduleRef.get(PrioritiesService);
+  });
+
+  // AC1 — POST with a valid payload returns the created priority (id + submitted fields).
+  it('AC1: creates a priority with a generated id and the submitted fields', () => {
+    const created = controller.create({ name: 'Urgent', level: 0 });
+
+    expect(created.id).toEqual(expect.any(String));
+    expect(created.id).not.toHaveLength(0);
+    expect(created).toMatchObject({ name: 'Urgent', level: 0 });
+    // createdAt is a UTC ISO-8601 string (round-trips through Date).
+    expect(created.createdAt).toBe(new Date(created.createdAt).toISOString());
+    // Persisted.
+    expect(controller.findAll()).toHaveLength(1);
+  });
+
+  // AC2 — an invalid create is rejected (400) and nothing is persisted.
+  it('AC2: rejects an invalid create payload with 400 and does not persist it', async () => {
+    await expect(
+      pipe.transform({ name: '', level: -1 }, { type: 'body', metatype: CreatePriorityDto }),
+    ).rejects.toThrow(BadRequestException);
+
+    // The pipe runs before the handler, so the store is never touched.
+    expect(controller.findAll()).toHaveLength(0);
+  });
+
+  // AC3 — GET list returns every stored priority.
+  it('AC3: lists all stored priorities', () => {
+    controller.create({ name: 'A', level: 1 });
+    controller.create({ name: 'B', level: 2 });
+
+    const all = controller.findAll();
+    expect(Array.isArray(all)).toBe(true);
+    expect(all.map((p) => p.name).sort()).toEqual(['A', 'B']);
+  });
+
+  // AC4 — GET by id returns the matching priority.
+  it('AC4: returns a single priority by id', () => {
+    const created = controller.create({ name: 'High', level: 0 });
+    expect(controller.findOne(created.id)).toEqual(created);
+  });
+
+  // AC5 — get / update / delete against an unknown id all respond 404 without side effects.
+  it('AC5: responds 404 for get, update, and delete of a missing id', () => {
+    expect(() => controller.findOne('missing')).toThrow(NotFoundException);
+    expect(() => controller.update('missing', { name: 'x' })).toThrow(NotFoundException);
+    expect(() => controller.remove('missing')).toThrow(NotFoundException);
+    expect(controller.findAll()).toHaveLength(0);
+  });
+
+  // AC6 — PATCH with a valid payload reflects the change and preserves unchanged fields.
+  it('AC6: updates the provided fields and preserves the rest', () => {
+    const created = controller.create({ name: 'Mid', level: 3 });
+
+    const updated = controller.update(created.id, { name: 'Middle' });
+
+    expect(updated.name).toBe('Middle'); // changed
+    expect(updated.level).toBe(3); // preserved
+    expect(updated.id).toBe(created.id); // preserved
+    expect(updated.createdAt).toBe(created.createdAt); // preserved
+    // Persisted through the store.
+    expect(controller.findOne(created.id)).toMatchObject({ name: 'Middle', level: 3 });
+  });
+
+  // AC7 — an invalid update is rejected (400) and the stored priority is unchanged.
+  it('AC7: rejects an invalid update with 400 and leaves the stored priority unchanged', async () => {
+    const created = controller.create({ name: 'Mid', level: 3 });
+
+    await expect(
+      pipe.transform({ level: 'high' }, { type: 'body', metatype: UpdatePriorityDto }),
+    ).rejects.toThrow(BadRequestException);
+
+    expect(service.findOne(created.id)).toMatchObject({ name: 'Mid', level: 3 });
+  });
+
+  // AC8 — DELETE removes the priority; a later GET responds 404.
+  it('AC8: deletes a priority so a subsequent get responds 404', () => {
+    const created = controller.create({ name: 'Temp', level: 9 });
+
+    expect(controller.remove(created.id)).toEqual({ ok: true });
+    expect(() => controller.findOne(created.id)).toThrow(NotFoundException);
+  });
+});
diff --git a/backend/src/priorities/priorities.controller.ts b/backend/src/priorities/priorities.controller.ts
new file mode 100644
index 0000000..d20cfdb
--- /dev/null
+++ b/backend/src/priorit
```