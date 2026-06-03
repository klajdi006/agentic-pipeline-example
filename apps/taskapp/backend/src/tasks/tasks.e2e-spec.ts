import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TasksModule } from './tasks.module';
import { TasksService } from './tasks.service';

describe('GET /tasks/summary (e2e)', () => {
  let app: INestApplication;
  let summaryUrl: string;
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
    tasksUrl = `http://localhost:${port}/tasks`;
    summaryUrl = `${tasksUrl}/summary`;
    tasksService = app.get(TasksService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    (tasksService as any).tasks.clear();
  });

  it('returns 200 with all zeros for an empty store', async () => {
    const res = await fetch(summaryUrl);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ BACKLOG: 0, IN_PROGRESS: 0, DONE: 0 });
  });

  it('returns correct counts when tasks exist in each status', async () => {
    await fetch(tasksUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Backlog A' }),
    });
    await fetch(tasksUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Backlog B' }),
    });
    const inProgress = tasksService.create({ title: 'In Progress' });
    const done = tasksService.create({ title: 'Done' });
    (tasksService as any).tasks.get(inProgress.id).status = 'IN_PROGRESS';
    (tasksService as any).tasks.get(done.id).status = 'DONE';

    const res = await fetch(summaryUrl);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ BACKLOG: 2, IN_PROGRESS: 1, DONE: 1 });
  });

  it('returns zero for statuses with no tasks', async () => {
    await fetch(tasksUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Only task' }),
    });

    const res = await fetch(summaryUrl);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.IN_PROGRESS).toBe(0);
    expect(body.DONE).toBe(0);
    expect(body.BACKLOG).toBe(1);
  });

  // AC-1: response body contains exactly the three documented keys and no extras.
  it('AC-1: response body has exactly the keys BACKLOG, IN_PROGRESS, DONE', async () => {
    const res = await fetch(summaryUrl);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['BACKLOG', 'DONE', 'IN_PROGRESS']);
  });

  // AC-3: verbatim spec example — 3 POST /tasks → BACKLOG: 3 in GET /tasks/summary.
  it('AC-3: creating 3 tasks via POST yields BACKLOG: 3, IN_PROGRESS: 0, DONE: 0', async () => {
    for (let i = 1; i <= 3; i++) {
      await fetch(tasksUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Task ${i}` }),
      });
    }
    const res = await fetch(summaryUrl);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ BACKLOG: 3, IN_PROGRESS: 0, DONE: 0 });
  });
});
