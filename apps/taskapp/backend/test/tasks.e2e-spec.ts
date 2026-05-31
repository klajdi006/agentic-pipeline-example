import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { TasksModule } from '../src/tasks/tasks.module';

/**
 * Controller e2e for the tasks resource.
 *
 * This pins the task API contract the (Angular v21) frontend depends on, so the FE
 * control-flow migration can land without silently breaking the wire format. No
 * production backend code is changed by this work — only this spec is added.
 *
 * NOTE: like `priorities.e2e-spec.ts`, this lives outside the unit `jest` rootDir
 * (`src`) and depends on `supertest`, so it is not run by `npm test` in this
 * dependency-free skeleton. Wire up `supertest` and a `jest-e2e` config (the standard
 * Nest scaffold) to run it in CI.
 */
describe('Tasks (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TasksModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // AC-1 — POST /tasks creates a task (201) with the documented shape.
  it('POST /tasks creates a task (201)', async () => {
    const res = await request(app.getHttpServer())
      .post('/tasks')
      .send({ title: 'Write the report' })
      .expect(201);

    expect(res.body).toMatchObject({ title: 'Write the report', completed: false });
    expect(res.body.id).toBeDefined();
    // createdAt is a round-trippable UTC ISO-8601 string.
    expect(res.body.createdAt).toBe(new Date(res.body.createdAt).toISOString());
  });

  // AC-2 — GET /tasks lists tasks (200) as an array of the Task shape.
  it('GET /tasks lists tasks (200) as an array of Task', async () => {
    await request(app.getHttpServer())
      .post('/tasks')
      .send({ title: 'Listed task' })
      .expect(201);

    const res = await request(app.getHttpServer()).get('/tasks').expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      completed: expect.any(Boolean),
      createdAt: expect.any(String),
    });
  });

  // AC-3 — PATCH /tasks/:id/complete marks the task done (200, completed:true).
  it('PATCH /tasks/:id/complete returns 200 with completed:true', async () => {
    const created = await request(app.getHttpServer())
      .post('/tasks')
      .send({ title: 'Complete me' });

    const res = await request(app.getHttpServer())
      .patch(`/tasks/${created.body.id}/complete`)
      .expect(200);

    expect(res.body).toMatchObject({ id: created.body.id, completed: true });
  });

  // AC-4 — DELETE /tasks/:id removes it (200 {ok:true}), then GET /tasks/:id is 404.
  it('DELETE /tasks/:id returns 200 {ok:true}, then GET /tasks/:id is 404', async () => {
    const created = await request(app.getHttpServer())
      .post('/tasks')
      .send({ title: 'Temporary' });

    const res = await request(app.getHttpServer())
      .delete(`/tasks/${created.body.id}`)
      .expect(200);

    expect(res.body).toEqual({ ok: true });

    await request(app.getHttpServer())
      .get(`/tasks/${created.body.id}`)
      .expect(404);
  });

  // AC-5 — POST /tasks with empty/missing title is rejected (400) and creates nothing.
  it('POST /tasks rejects empty/missing title (400) and creates nothing', async () => {
    const before = await request(app.getHttpServer()).get('/tasks');

    await request(app.getHttpServer()).post('/tasks').send({ title: '' }).expect(400);
    await request(app.getHttpServer()).post('/tasks').send({}).expect(400);

    const after = await request(app.getHttpServer()).get('/tasks');
    expect(after.body.length).toBe(before.body.length);
  });
});
