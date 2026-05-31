Here's a PR description built from the actual diff. (No Linear access here, so I derived the acceptance criteria from the change + the new tests — adjust wording if the KLA-5 ticket phrases them differently.)

---

## Add task priority (low / medium / high)

Closes **KLA-5**

### What & why

Tasks previously had no notion of importance, so `findAll()` returned them in raw insertion order with no way to surface urgent work. This adds a bounded `priority` field to the task model, defaults it sensibly on create, validates it at the API boundary, and orders the task list by priority.

### Changes

- **`task.model.ts`** — Introduce `TaskPriority` as a `const` object + matching union type (`'low' | 'medium' | 'high'`) so it works both as a runtime value (`@IsEnum`) and a compile-time type. Add a required `priority` field to the `Task` interface.
- **`dto/create-task.dto.ts`** — Add an optional `priority` field validated with `@IsOptional()` + `@IsEnum(TaskPriority)`; out-of-range values are rejected at the boundary.
- **`tasks.service.ts`** — Default `priority` to `medium` when omitted on create. `findAll()` now sorts high → medium → low via a `PRIORITY_RANK` map, with a stable tiebreaker on insertion index so equal priorities keep their original order.
- **`tasks.service.spec.ts`** — Unit tests covering defaulting, persistence/round-trip, ordering, stable tiebreaker, DTO rejection, and the value-range invariant.

### Acceptance criteria

- [x] Tasks carry a `priority` of `low`, `medium`, or `high` — *type added to `Task`; "every task has an allowed priority" test passes.*
- [x] `priority` is optional on create and defaults to `medium` — *`priority: dto.priority ?? TaskPriority.medium`; "defaults to medium when omitted" test.*
- [x] An explicit priority is persisted and returned — *"persists and returns an explicit high priority" round-trips through the store.*
- [x] Task list is ordered high → medium → low — *`PRIORITY_RANK` sort; "orders findAll() high → medium → low" test.*
- [x] Equal priorities preserve insertion order — *stable index tiebreaker; "keeps insertion order for equal priorities" test.*
- [x] Invalid priorities are rejected at the API boundary — *`@IsEnum`; "rejects an out-of-range priority at the DTO boundary" test.*

### Notes / conventions

- Storage is the in-memory repository, so no migration is required (per CLAUDE.md). A production TypeORM column + migration would be the follow-up when storage moves to Postgres.
- No shared-types contract was touched in this diff; if `libs/shared-types/` exposes a task contract consumed by the frontend, it should be updated to include `priority` before/with the FE work.

---

A couple of things worth flagging before you ship this:

- I don't have the real KLA-5 text, so the criteria above are reverse-engineered from the diff. If the ticket lists different/additional criteria (e.g. a frontend priority selector), this PR is backend-only and wouldn't satisfy them.
- The change doesn't update `libs/shared-types/` — if the FE relies on a shared `Task` type, that's a gap.

Want me to refine the description further, or should I leave it here?

---

## Diff (`git diff --cached`)

```diff
diff --git a/backend/src/tasks/dto/create-task.dto.ts b/backend/src/tasks/dto/create-task.dto.ts
index d43ea87..927d5ab 100644
--- a/backend/src/tasks/dto/create-task.dto.ts
+++ b/backend/src/tasks/dto/create-task.dto.ts
@@ -1,8 +1,13 @@
-import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
+import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
+import { TaskPriority } from '../task.model';
 
 export class CreateTaskDto {
   @IsString()
   @IsNotEmpty()
   @MaxLength(200)
   title!: string;
+
+  @IsOptional()
+  @IsEnum(TaskPriority)
+  priority?: TaskPriority;
 }
diff --git a/backend/src/tasks/task.model.ts b/backend/src/tasks/task.model.ts
index 8b219af..111db37 100644
--- a/backend/src/tasks/task.model.ts
+++ b/backend/src/tasks/task.model.ts
@@ -1,7 +1,20 @@
+/**
+ * Bounded task priority. Declared as a const object + matching type so it can be
+ * used both as a runtime value (e.g. `@IsEnum(TaskPriority)` in the DTO) and as a
+ * `'low' | 'medium' | 'high'` union type.
+ */
+export const TaskPriority = {
+  low: 'low',
+  medium: 'medium',
+  high: 'high',
+} as const;
+export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];
+
 export interface Task {
   id: string;
   title: string;
   completed: boolean;
+  priority: TaskPriority;
   /** UTC ISO-8601 timestamp. Never store local time (see CLAUDE.md). */
   createdAt: string;
 }
diff --git a/backend/src/tasks/tasks.service.spec.ts b/backend/src/tasks/tasks.service.spec.ts
index 7d0b97d..3335220 100644
--- a/backend/src/tasks/tasks.service.spec.ts
+++ b/backend/src/tasks/tasks.service.spec.ts
@@ -1,4 +1,8 @@
 import { NotFoundException } from '@nestjs/common';
+import { plainToInstance } from 'class-transformer';
+import { validateSync } from 'class-validator';
+import { CreateTaskDto } from './dto/create-task.dto';
+import { TaskPriority } from './task.model';
 import { TasksService } from './tasks.service';
 
 describe('TasksService', () => {
@@ -32,4 +36,60 @@ describe('TasksService', () => {
   it('throws NotFound for a missing task', () => {
     expect(() => service.findOne('missing')).toThrow(NotFoundException);
   });
+
+  describe('priority', () => {
+    it('defaults priority to "medium" when omitted on create', () => {
+      const task = service.create({ title: 'No priority given' });
+      expect(task.priority).toBe('medium');
+    });
+
+    it('persists and returns an explicit "high" priority', () => {
+      const created = service.create({ title: 'Urgent', priority: 'high' });
+      expect(created.priority).toBe('high');
+      // round-trips through the store
+      expect(service.findOne(created.id).priority).toBe('high');
+    });
+
+    it('orders findAll() high → medium → low', () => {
+      service.create({ title: 'lo', priority: 'low' });
+      service.create({ title: 'hi', priority: 'high' });
+      service.create({ title: 'mid', priority: 'medium' });
+
+      expect(service.findAll().map((t) => t.title)).toEqual(['hi', 'mid', 'lo']);
+    });
+
+    it('keeps insertion order for equal priorities (stable tiebreaker)', () => {
+      service.create({ title: 'first', priority: 'high' });
+      service.create({ title: 'second', priority: 'high' });
+      service.create({ title: 'third', priority: 'high' });
+
+      expect(service.findAll().map((t) => t.title)).toEqual([
+        'first',
+        'second',
+        'third',
+      ]);
+    });
+
+    it('rejects an out-of-range priority at the DTO boundary', () => {
+      const dto = plainToInstance(CreateTaskDto, {
+        title: 'Bad priority',
+        priority: 'urgent',
+      });
+
+      const errors = validateSync(dto);
+      expect(errors.some((e) => e.property === 'priority')).toBe(true);
+    });
+
+    it('returns a priority that is one of low|medium|high on every task', () => {
+      service.create({ title: 'defaulted' });
+      service.create({ title: 'explicit low', priority: 'low' });
+      service.create({ title: 'explicit high', priority: 'high' });
+
+      const allowed: TaskPriority[] = ['low', 'medium', 'high'];
+      for (const task of service.findAll()) {
+        expect(task).toHaveProperty('priority');
+        expect(allowed).toContain(task.priority);
+      }
+    });
+  });
 });
diff --git a/backend/src/tasks/tasks.service.ts b/backend/src/tasks/tasks.service.ts
index 2d9cf25..4ced5b7 100644
--- a/backend/src/tasks/tasks.service.ts
+++ b/backend/src/tasks/tasks.service.ts
@@ -1,7 +1,14 @@
 import { Injectable, NotFoundException } from '@nestjs/common';
 import { randomUUID } from 'node:crypto';
 import { CreateTaskDto } from './dto/create-task.dto';
-import { Task } from './task.model';
+import { Task, TaskPriority } from './task.model';
+
+/** Sort weight for priority ordering: high first, then medium, then low. */
+const PRIORITY_RANK: Record<TaskPriority, number> = {
+  high: 0,
+  medium: 1,
+  low: 2,
+};
 
 /**
  * In-memory task store. Production would back this with TypeORM + Postgres
@@ -17,14 +24,26 @@ export class TasksService {
       id: randomUUID(),
       title: dto.title,
       completed: false,
+      priority: dto.priority ?? TaskPriority.medium,
       createdAt: new Date().toISOString(),
     };
     this.tasks.set(task.id, task);
     return task;
   }
 
+  /**
+   * Returns tasks ordered high → medium → low. Equal priorities keep their
+   * original insertion order (stable tiebreaker on the Map's insertion index).
+   */
   findAll(): Task[] {
-    return [...this.tasks.values()];
+    return [...this.tasks.values()]
+      .map((task, index) => ({ task, index }))
+      .sort(
+        (a, b) =>
+          PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority] ||
+          a.index - b.index,
+      )
+      .map(({ task }) => task);
   }
 
   findOne(id: string): Task {

```