import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { BadRequestException, INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CreateTaskDto } from './dto/create-task.dto';
import { TasksController } from './tasks.controller';
import { TasksModule } from './tasks.module';
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

  it('status defaults to BACKLOG on create and is present on GET /tasks', () => {
    const created = controller.create({ title: 'Status test' });

    expect(created.status).toBe('BACKLOG');
    const [found] = controller.findAll({ page: 1, limit: 20 }).items;
    expect(found.status).toBe('BACKLOG');
  });

  // TASK-142 AC-1 — description is persisted when provided.
  it('TASK-142 AC-1: persists the description when provided and returns it on GET /tasks', () => {
    const created = controller.create({ title: 'Described task', description: 'Extra detail here' });

    expect(created.description).toBe('Extra detail here');
    const [found] = controller.findAll({ page: 1, limit: 20 }).items;
    expect(found.description).toBe('Extra detail here');
  });

  // TASK-142 AC-2 — description is null when the field is omitted.
  it('TASK-142 AC-2: description is null when the field is omitted', () => {
    const created = controller.create({ title: 'No description' });

    expect(created.description).toBeNull();
    const [found] = controller.findAll({ page: 1, limit: 20 }).items;
    expect(found.description).toBeNull();
  });

  // TASK-142 AC-2 — description is null even when explicitly passed as undefined.
  it('TASK-142 AC-2: description is null when explicitly passed as undefined', () => {
    const created = controller.create({ title: 'Explicit undef', description: undefined });
    expect(created.description).toBeNull();
  });

  // TASK-142 AC-1 — MaxLength(2000) on description is enforced.
  it('TASK-142 AC-1: rejects a description exceeding 2000 chars with 400', async () => {
    await expect(
      pipe.transform(
        { title: 'ok', description: 'x'.repeat(2001) },
        { type: 'body', metatype: CreateTaskDto },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // TASK-142 AC-1 — description at the 2000-char boundary is accepted.
  it('TASK-142 AC-1: accepts a description at the 2000-char boundary', async () => {
    await expect(
      pipe.transform(
        { title: 'ok', description: 'x'.repeat(2000) },
        { type: 'body', metatype: CreateTaskDto },
      ),
    ).resolves.toMatchObject({ description: 'x'.repeat(2000) });
  });
});

describe('GET /tasks/export (TASK-142 CSV export)', () => {
  let app: INestApplication;
  let exportUrl: string;
  let tasksUrl: string;
  let tasksService: TasksService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [TasksModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    const base = `http://localhost:${port}`;
    exportUrl = `${base}/tasks/export`;
    tasksUrl = `${base}/tasks`;
    tasksService = app.get(TasksService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    (tasksService as any).tasks.clear();
  });

  it('empty repository → 200 with BOM + header only', async () => {
    const res = await fetch(exportUrl);
    expect(res.status).toBe(200);
    // fetch().text() strips the BOM per the WHATWG spec; verify BOM via raw bytes
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes[0]).toBe(0xef); // UTF-8 BOM: EF BB BF
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
    const text = new TextDecoder('utf-8').decode(bytes); // strips BOM
    const lines = text.split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('id,title,priority,completed,createdAt,description');
  });

  it('Content-Type contains text/csv', async () => {
    const res = await fetch(exportUrl);
    expect(res.headers.get('content-type')).toContain('text/csv');
  });

  it('Content-Disposition equals attachment; filename="tasks.csv"', async () => {
    const res = await fetch(exportUrl);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="tasks.csv"');
  });

  describe('with seeded tasks', () => {
    const taskCount = 2;

    beforeEach(async () => {
      const post = (title: string, priority: string) =>
        fetch(tasksUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, priority }),
        });
      await post('Alpha', 'high');
      await post('Beta', 'low');
    });

    it('200 status with tasks present', async () => {
      const res = await fetch(exportUrl);
      expect(res.status).toBe(200);
    });

    it('BOM is present in raw bytes (EF BB BF)', async () => {
      const bytes = new Uint8Array(await (await fetch(exportUrl)).arrayBuffer());
      expect(bytes[0]).toBe(0xef);
      expect(bytes[1]).toBe(0xbb);
      expect(bytes[2]).toBe(0xbf);
    });

    it('row count equals task count plus header', async () => {
      const body = await (await fetch(exportUrl)).text(); // fetch strips BOM
      const lines = body.split('\n');
      expect(lines).toHaveLength(taskCount + 1);
    });

    it('data rows contain correct column values', async () => {
      const body = await (await fetch(exportUrl)).text(); // fetch strips BOM
      const lines = body.split('\n');
      expect(lines[0]).toBe('id,title,priority,completed,createdAt,description');
      // first data row (high priority sorts first)
      const [id, title, priority, completed, createdAt] = lines[1].split(',');
      expect(id).toBeTruthy();
      expect(title).toBe('Alpha');
      expect(priority).toBe('high');
      expect(completed).toBe('false');
      expect(new Date(createdAt).toISOString()).toBe(createdAt);
    });

    it('route does not fall through to the /:id handler', async () => {
      // If "export" were treated as an :id param, it would 404 (no task with id "export")
      const res = await fetch(exportUrl);
      expect(res.status).toBe(200);
    });
  });

  describe('TASK-142 AC-3: description column values', () => {
    afterEach(() => {
      (tasksService as any).tasks.clear();
    });

    it('AC-3: description column contains the task description when provided', async () => {
      await fetch(tasksUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Has desc', priority: 'medium', description: 'My details' }),
      });
      const body = await (await fetch(exportUrl)).text();
      const lines = body.split('\n');
      expect(lines[0]).toBe('id,title,priority,completed,createdAt,description');
      const descCell = lines[1].split(',')[5];
      expect(descCell).toBe('My details');
    });

    it('AC-3: description column is empty when description is null', async () => {
      await fetch(tasksUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'No desc', priority: 'medium' }),
      });
      const body = await (await fetch(exportUrl)).text();
      const lines = body.split('\n');
      const descCell = lines[1].split(',')[5];
      expect(descCell).toBe('');
    });

    it('AC-3: description starting with an injection char is sanitised with a single quote', async () => {
      await fetch(tasksUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Safe', priority: 'medium', description: '=DANGEROUS' }),
      });
      const body = await (await fetch(exportUrl)).text();
      const descCell = body.split('\n')[1].split(',')[5];
      expect(descCell).toBe("'=DANGEROUS");
    });
  });

  describe('CSV injection sanitisation (AC-5)', () => {
    it.each(['=', '+', '-', '@'])(
      'title starting with %s is prefixed with a single quote in the exported CSV',
      async (char) => {
        await fetch(tasksUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: `${char}FORMULA`, priority: 'medium' }),
        });
        const body = await (await fetch(exportUrl)).text(); // fetch strips BOM
        const lines = body.split('\n');
        const titleCell = lines[1].split(',')[1];
        expect(titleCell).toBe(`'${char}FORMULA`);
      },
    );
  });

  describe('sort order (AC-9)', () => {
    it('rows are ordered high → medium → low by priority rank', async () => {
      const post = (title: string, priority: string) =>
        fetch(tasksUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, priority }),
        });
      await post('LowTask', 'low');
      await post('MediumTask', 'medium');
      await post('HighTask', 'high');

      const body = await (await fetch(exportUrl)).text(); // fetch strips BOM
      const lines = body.split('\n');
      expect(lines).toHaveLength(4); // header + 3 data rows
      expect(lines[1].split(',')[2]).toBe('high');
      expect(lines[2].split(',')[2]).toBe('medium');
      expect(lines[3].split(',')[2]).toBe('low');
    });

    it('within the same priority, rows are ordered by createdAt ascending', async () => {
      const post = (title: string) =>
        fetch(tasksUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, priority: 'high' }),
        });
      await post('First');
      await post('Second');
      await post('Third');

      const body = await (await fetch(exportUrl)).text(); // fetch strips BOM
      const lines = body.split('\n');
      expect(lines[1].split(',')[1]).toBe('First');
      expect(lines[2].split(',')[1]).toBe('Second');
      expect(lines[3].split(',')[1]).toBe('Third');
    });
  });
});
