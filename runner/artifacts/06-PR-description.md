Here's the PR description:

---

## feat: paginate GET /tasks and wire frontend to paginated response

Closes KLA-9

### Summary

- **Backend:** `TasksService.findAll()` now returns `{ items, total, page, limit }` instead of a plain array. Defaults: `page=1`, `limit=20`. `TasksController` accepts `?page=&limit=` query params via a new `PaginationQueryDto`.
- **Shared types:** Added `PaginatedResponse<T>` contract in `libs/shared-types` (`pagination.contract.ts`) and a typed `Task` contract (`task.contract.ts`) consumed by both ends.
- **Frontend:** `TaskListComponent` migrated from an always-on inline mount to a routed page (`/tasks`). `TasksApiService` updated to return the paginated shape. `AppComponent` nav now includes a Tasks link; `TaskListComponent` is no longer imported directly.
- **Tests:** Jest config updated to pick up `e2e-spec` files. New pagination unit tests added to `tasks.service.spec.ts`; controller spec and service spec updated throughout to assert on `.items` and `.total`.

### Acceptance criteria

| # | Criterion | Status |
|---|-----------|--------|
| AC-1 | 25 tasks, no query params → `items.length === 20`, `total === 25`, `page === 1`, `limit === 20` | ✅ covered by `tasks.service.spec.ts` |
| AC-2 | `GET /tasks` returns a paginated object whose `items` match the Task shape (`id`, `title`, `completed`, UTC ISO `createdAt`) | ✅ covered by `tasks.controller.spec.ts` |
| AC-3 | 25 tasks, `page=3&limit=10` → 5 items (partial last page), `total === 25` | ✅ covered by `tasks.service.spec.ts` |
| AC-4 | 25 tasks, `page=4&limit=10` → empty `items`, `total === 25` | ✅ covered by `tasks.service.spec.ts` |
| AC-5 | Empty store → `{ items: [], total: 0, page: 1, limit: 20 }` | ✅ covered by `tasks.service.spec.ts` |
| AC-9 | Paginated slice preserves high → medium → low priority sort order | ✅ covered by `tasks.service.spec.ts` |
| AC-10 | `limit` larger than total → all items returned, `total` and `limit` echoed back correctly | ✅ covered by `tasks.service.spec.ts` |

### Test plan

- [ ] `cd apps/taskapp/backend && npm test` — all unit + e2e specs green
- [ ] `cd apps/taskapp/frontend && npm test` — component specs green
- [ ] Manual: open `/tasks`, create several tasks, confirm list renders; open DevTools Network tab and verify `GET /tasks` response has `{ items, total, page, limit }` shape
- [ ] Manual: `GET /tasks?page=2&limit=3` on a store with >3 tasks returns the correct slice

🤖 Generated with [Claude Code](https://claude.com/claude-code)

---

## Diff (`git diff --cached`)

```diff
diff --git a/apps/taskapp/backend/package.json b/apps/taskapp/backend/package.json
index 1036ff8..8d0dde3 100644
--- a/apps/taskapp/backend/package.json
+++ b/apps/taskapp/backend/package.json
@@ -30,6 +30,6 @@
     "testEnvironment": "node",
     "moduleFileExtensions": ["ts", "js", "json"],
     "rootDir": "src",
-    "testRegex": ".*\\.spec\\.ts$"
+    "testRegex": ".*\\.(spec|e2e-spec)\\.ts$"
   }
 }
diff --git a/apps/taskapp/backend/src/tasks/tasks.controller.spec.ts b/apps/taskapp/backend/src/tasks/tasks.controller.spec.ts
index 7d5732f..70e1eca 100644
--- a/apps/taskapp/backend/src/tasks/tasks.controller.spec.ts
+++ b/apps/taskapp/backend/src/tasks/tasks.controller.spec.ts
@@ -45,19 +45,20 @@ describe('TasksController (TASK-142 contract)', () => {
     // createdAt round-trips as a UTC ISO-8601 string (no local-time storage).
     expect(created.createdAt).toBe(new Date(created.createdAt).toISOString());
     // Persisted through the store.
-    expect(controller.findAll()).toHaveLength(1);
+    expect(controller.findAll({ page: 1, limit: 20 }).items).toHaveLength(1);
   });
 
-  // AC-2 — GET /tasks lists tasks (200) as an array of the documented Task shape.
-  it('AC-2: lists tasks as an array matching the Task shape (id, title, completed, UTC ISO createdAt)', () => {
+  // AC-2 — GET /tasks lists tasks (200) as a paginated response with an items array.
+  it('AC-2: lists tasks as a paginated response matching the Task shape (id, title, completed, UTC ISO createdAt)', () => {
     controller.create({ title: 'First' });
     controller.create({ title: 'Second' });
 
-    const all = controller.findAll();
+    const result = controller.findAll({ page: 1, limit: 20 });
 
-    expect(Array.isArray(all)).toBe(true);
-    expect(all).toHaveLength(2);
-    for (const task of all) {
+    expect(Array.isArray(result.items)).toBe(true);
+    expect(result.items).toHaveLength(2);
+    expect(result.total).toBe(2);
+    for (const task of result.items) {
       expect(task).toMatchObject({
         id: expect.any(String),
         title: expect.any(String),
@@ -95,7 +96,7 @@ describe('TasksController (TASK-142 contract)', () => {
     ).rejects.toThrow(BadRequestException);
 
     // The pipe runs before the handler, so the store is never touched.
-    expect(controller.findAll()).toHaveLength(0);
+    expect(controller.findAll({ page: 1, limit: 20 }).items).toHaveLength(0);
   });
 
   it('AC-5: rejects a missing title with 400 and does not create a task', async () => {
@@ -103,6 +104,6 @@ describe('TasksController (TASK-142 contract)', () => {
       pipe.transform({}, { type: 'body', metatype: CreateTaskDto }),
     ).rejects.toThrow(BadRequestException);
 
-    expect(service.findAll()).toHaveLength(0);
+    expect(service.findAll().items).toHaveLength(0);
   });
 });
diff --git a/apps/taskapp/backend/src/tasks/tasks.controller.ts b/apps/taskapp/backend/src/tasks/tasks.controller.ts
index 7960e02..3a8eb59 100644
--- a/apps/taskapp/backend/src/tasks/tasks.controller.ts
+++ b/apps/taskapp/backend/src/tasks/tasks.controller.ts
@@ -1,5 +1,6 @@
-import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
+import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
 import { CreateTaskDto } from './dto/create-task.dto';
+import { PaginationQueryDto } from './dto/pagination-query.dto';
 import { TasksService } from './tasks.service';
 
 @Controller('tasks')
@@ -12,8 +13,8 @@ export class TasksController {
   }
 
   @Get()
-  findAll() {
-    return this.tasks.findAll();
+  findAll(@Query() query: PaginationQueryDto) {
+    return this.tasks.findAll(query.page, query.limit);
   }
 
   @Get(':id')
diff --git a/apps/taskapp/backend/src/tasks/tasks.service.spec.ts b/apps/taskapp/backend/src/tasks/tasks.service.spec.ts
index 3335220..c79c58d 100644
--- a/apps/taskapp/backend/src/tasks/tasks.service.spec.ts
+++ b/apps/taskapp/backend/src/tasks/tasks.service.spec.ts
@@ -25,7 +25,7 @@ describe('TasksService', () => {
   it('lists all created tasks', () => {
     service.create({ title: 'A' });
     service.create({ title: 'B' });
-    expect(service.findAll()).toHaveLength(2);
+    expect(service.findAll().items).toHaveLength(2);
   });
 
   it('marks a task complete', () => {
@@ -55,7 +55,7 @@ describe('TasksService', () => {
       service.create({ title: 'hi', priority: 'high' });
       service.create({ title: 'mid', priority: 'medium' });
 
-      expect(service.findAll().map((t) => t.title)).toEqual(['hi', 'mid', 'lo']);
+      expect(service.findAll().items.map((t) => t.title)).toEqual(['hi', 'mid', 'lo']);
     });
 
     it('keeps insertion order for equal priorities (stable tiebreaker)', () => {
@@ -63,7 +63,7 @@ describe('TasksService', () => {
       service.create({ title: 'second', priority: 'high' });
       service.create({ title: 'third', priority: 'high' });
 
-      expect(service.findAll().map((t) => t.title)).toEqual([
+      expect(service.findAll().items.map((t) => t.title)).toEqual([
         'first',
         'second',
         'third',
@@ -86,10 +86,107 @@ describe('TasksService', () => {
       service.create({ title: 'explicit high', priority: 'high' });
 
       const allowed: TaskPriority[] = ['low', 'medium', 'high'];
-      for (const task of service.findAll()) {
+      for (const task of service.findAll().items) {
         expect(task).toHaveProperty('priority');
         expect(allowed).toContain(task.priority);
       }
     });
   });
+
+  describe('pagination', () => {
+    it('returns page=1, limit=20 by default with correct total', () => {
+      for (let i = 0; i < 5; i++) service.create({ title: `Task ${i}` });
+      const result = service.findAll();
+      expect(result.page).toBe(1);
+      expect(result.limit).toBe(20);
+      expect(result.total).toBe(5);
+      expect(result.items).toHaveLength(5);
+    });
+
+    it('slices correctly for custom page and limit', () => {
+      for (let i = 1; i <= 25; i++) service.create({ title: `Task ${i}` });
+      const result = service.findAll(2, 10);
+      expect(result.page).toBe(2);
+      expect(result.limit).toBe(10);
+      expect(result.total).toBe(25);
+      expect(result.items).toHaveLength(10);
+    });
+
+    it('returns empty items and correct total when page exceeds available data', () => {
+      for (let i = 0; i < 5; i++) service.create({ title: `Task ${i}` });
+      const result = service.findAll(10, 20);
+      expect(result.items).toHaveLength(0);
+      expect(result.total).toBe(5);
+    });
+
+    it('total reflects full store size regardless of page/limit', () => {
+      for (let i = 0; i < 50; i++) service.create({ title: `Task ${i}` });
+      const p1 = service.findAll(1, 20);
+      const p3 = service.findAll(3, 20);
+      expect(p1.total).toBe(50);
+      expect(p3.total).toBe(50);
+      expect(p1.items).toHaveLength(20);
+      expect(p3.items).toHaveLength(10);
+    });
+
+    // AC-1: 25 tasks, default params → exactly 20 items on page 1
+    it('AC-1: 25 tasks, no params → 20 items, total=25, page=1, limit=20', () => {
+      for (let i = 1; i <= 25; i++) service.create({ title: `Task ${i}` });
+      const result = service.findAll();
+      expect(result.items).toHaveLength(20);
+      expect(result.total).toBe(25);
+      expect(result.page).toBe(1);
+      expect(result.limit).toBe(20);
+    });
+
+    // AC-3: 25 tasks, page=3, limit=10 → 5 items (partial last page), total=25
+    it('AC-3: 25 tasks, page=3, limit=10 → 5 items, total=25', () => {
+      for (let i = 1; i <= 25; i++) service.create({ title: `Task ${i}` });
+      const result = service.findAll(3, 10);
+      expect(result.items).toHaveLength(5);
+      expect(result.total).toBe(25);
+      expect(result.page).toBe(3);
+    });
+
+    // AC-4: 25 tasks, page=4, limit=10 → empty items, total still 25
+    it('AC-4: 25 tasks, page=4, limit=10 → empty items, total=25', () => {
+      for (let i = 1; i <= 25; i++) service
```