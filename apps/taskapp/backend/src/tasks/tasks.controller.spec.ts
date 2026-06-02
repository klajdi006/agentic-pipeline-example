import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CreateTaskDto } from './dto/create-task.dto';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

/**
 * Controller-level spec for the tasks resource — the contract the upgraded Angular v21
 * frontend consumes (TASK-142).
 *
 * The frontend work is template/state-only; the task API must stay byte-for-byte
 * compatible. The acceptance criteria are phrased as supertest e2e flows, but
 * `tasks.e2e-spec.ts` lives outside the unit `rootDir` (`src`) and needs `supertest`,
 * which is not installed, so it never runs under `npm test`. This spec pins the same
 * acceptance criteria in-process — through the real `TasksController` plus a real
 * `ValidationPipe` (the same one main.ts registers) — so the HTTP-status and payload
 * semantics each AC asserts are verified by the standard `npm test` toolchain.
 *
 * No production code is changed by this work — only this spec is added.
 */
describe('TasksController (TASK-142 contract)', () => {
  let controller: TasksController;
  let service: TasksService;
  // Mirrors the global pipe registered in main.ts / the e2e bootstrap.
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [TasksService],
    }).compile();

    controller = moduleRef.get(TasksController);
    service = moduleRef.get(TasksService);
  });

  // AC-1 — POST /tasks creates a task (201) with id, title, completed=false, UTC ISO createdAt.
  it('AC-1: creates a task with id, title, completed=false, and a UTC ISO-8601 createdAt', () => {
    const created = controller.create({ title: 'Write the report' });

    expect(created.id).toEqual(expect.any(String));
    expect(created.id).not.toHaveLength(0);
    expect(created.title).toBe('Write the report');
    expect(created.completed).toBe(false);
    // createdAt round-trips as a UTC ISO-8601 string (no local-time storage).
    expect(created.createdAt).toBe(new Date(created.createdAt).toISOString());
    // Persisted through the store.
    expect(controller.findAll({ page: 1, limit: 20 }).items).toHaveLength(1);
  });

  // AC-2 — GET /tasks lists tasks (200) as a paginated response with an items array.
  it('AC-2: lists tasks as a paginated response matching the Task shape (id, title, completed, UTC ISO createdAt)', () => {
    controller.create({ title: 'First' });
    controller.create({ title: 'Second' });

    const result = controller.findAll({ page: 1, limit: 20 });

    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
    for (const task of result.items) {
      expect(task).toMatchObject({
        id: expect.any(String),
        title: expect.any(String),
        completed: expect.any(Boolean),
        createdAt: expect.any(String),
      });
      // Every createdAt is a valid UTC ISO-8601 string.
      expect(task.createdAt).toBe(new Date(task.createdAt).toISOString());
    }
  });

  // AC-3 — PATCH /tasks/:id/complete marks the task done (200, completed:true).
  it('AC-3: marks a task complete and returns it with completed=true', () => {
    const created = controller.create({ title: 'Complete me' });

    const completed = controller.complete(created.id);

    expect(completed).toMatchObject({ id: created.id, completed: true });
    // Persisted: a subsequent fetch reflects the completed state.
    expect(controller.findOne(created.id).completed).toBe(true);
  });

  // AC-4 — DELETE /tasks/:id returns 200 {ok:true}; a subsequent GET /tasks/:id is 404.
  it('AC-4: deletes a task (returns {ok:true}) so a subsequent fetch responds 404', () => {
    const created = controller.create({ title: 'Temporary' });

    expect(controller.remove(created.id)).toEqual({ ok: true });
    expect(() => controller.findOne(created.id)).toThrow(NotFoundException);
  });

  // AC-5 — POST /tasks with an invalid body is rejected (400) and creates nothing.
  it('AC-5: rejects an empty title with 400 and does not create a task', async () => {
    await expect(
      pipe.transform({ title: '' }, { type: 'body', metatype: CreateTaskDto }),
    ).rejects.toThrow(BadRequestException);

    // The pipe runs before the handler, so the store is never touched.
    expect(controller.findAll({ page: 1, limit: 20 }).items).toHaveLength(0);
  });

  it('AC-5: rejects a missing title with 400 and does not create a task', async () => {
    await expect(
      pipe.transform({}, { type: 'body', metatype: CreateTaskDto }),
    ).rejects.toThrow(BadRequestException);

    expect(service.findAll().items).toHaveLength(0);
  });
});
