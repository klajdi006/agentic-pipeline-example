import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TasksModule } from './tasks.module';
import { TasksService } from './tasks.service';

describe('GET /tasks (e2e)', () => {
  let app: INestApplication;
  let url: string;
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
    url = `http://localhost:${port}/tasks`;
    tasksService = app.get(TasksService);
  });

  afterAll(async () => {
    await app.close();
  });

  // AC-5: empty store
  it('empty store → 200 with items=[], total=0, default page/limit', async () => {
    const res = await fetch(url);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ items: [], total: 0, page: 1, limit: 20 });
  });

  // AC-6: limit above max → 400
  it('limit=101 → 400', async () => {
    const res = await fetch(`${url}?limit=101`);
    expect(res.status).toBe(400);
  });

  // AC-7: page below min → 400
  it('page=0 → 400', async () => {
    const res = await fetch(`${url}?page=0`);
    expect(res.status).toBe(400);
  });

  // AC-8: limit below min → 400
  it('limit=0 → 400', async () => {
    const res = await fetch(`${url}?limit=0`);
    expect(res.status).toBe(400);
  });

  describe('with 25 seeded tasks (AC-1, AC-2, AC-3, AC-4)', () => {
    beforeAll(async () => {
      for (let i = 1; i <= 25; i++) {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: `Task ${i}` }),
        });
      }
    });

    afterAll(() => {
      (tasksService as any).tasks.clear();
    });

    // AC-1
    it('no params → 200, page=1, limit=20, total=25, 20 items', async () => {
      const res = await fetch(url);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
      expect(body.total).toBe(25);
      expect(body.items).toHaveLength(20);
    });

    // AC-2
    it('page=2&limit=10 → 200, correct slice (items 11–20)', async () => {
      const res = await fetch(`${url}?page=2&limit=10`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.page).toBe(2);
      expect(body.limit).toBe(10);
      expect(body.total).toBe(25);
      expect(body.items).toHaveLength(10);
    });

    // AC-3
    it('page=3&limit=10 → 200, 5 items (partial last page), total=25', async () => {
      const res = await fetch(`${url}?page=3&limit=10`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.page).toBe(3);
      expect(body.total).toBe(25);
      expect(body.items).toHaveLength(5);
    });

    // AC-4
    it('page=4&limit=10 → 200, empty items, total=25', async () => {
      const res = await fetch(`${url}?page=4&limit=10`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(0);
      expect(body.total).toBe(25);
      expect(body.page).toBe(4);
    });
  });

  describe('with mixed priority tasks (AC-9)', () => {
    beforeAll(async () => {
      const post = (title: string, priority: string) =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, priority }),
        });
      await post('Low task', 'low');
      await post('High task', 'high');
      await post('Medium task', 'medium');
    });

    afterAll(() => {
      (tasksService as any).tasks.clear();
    });

    it('page=1&limit=5 → items ordered high→medium→low by priority rank', async () => {
      const res = await fetch(`${url}?page=1&limit=5`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items.map((t: { priority: string }) => t.priority)).toEqual([
        'high',
        'medium',
        'low',
      ]);
    });
  });

  describe('with 5 tasks (AC-10)', () => {
    beforeAll(async () => {
      for (let i = 1; i <= 5; i++) {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: `Task ${i}` }),
        });
      }
    });

    afterAll(() => {
      (tasksService as any).tasks.clear();
    });

    it('page=1&limit=100 → 200, items.length=5, total=5, limit=100', async () => {
      const res = await fetch(`${url}?page=1&limit=100`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(5);
      expect(body.total).toBe(5);
      expect(body.limit).toBe(100);
    });
  });
});
