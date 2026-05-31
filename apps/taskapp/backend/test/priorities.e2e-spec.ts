import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrioritiesModule } from '../src/priorities/priorities.module';

/**
 * Controller e2e for the priorities resource.
 *
 * NOTE: this lives outside the unit `jest` rootDir (`src`) and depends on `supertest`,
 * so it is not run by `npm test` in this dependency-free skeleton. Wire up `supertest`
 * and a `jest-e2e` config (the standard Nest scaffold) to run it in CI.
 */
describe('Priorities (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrioritiesModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /priorities creates a priority (201)', async () => {
    const res = await request(app.getHttpServer())
      .post('/priorities')
      .send({ name: 'Urgent', level: 0 })
      .expect(201);

    expect(res.body).toMatchObject({ name: 'Urgent', level: 0 });
    expect(res.body.id).toBeDefined();
    expect(res.body.createdAt).toBe(new Date(res.body.createdAt).toISOString());
  });

  it('POST /priorities rejects invalid input (400)', async () => {
    await request(app.getHttpServer())
      .post('/priorities')
      .send({ name: '', level: -1 })
      .expect(400);
  });

  it('GET /priorities lists priorities (200)', async () => {
    await request(app.getHttpServer()).get('/priorities').expect(200);
  });

  it('GET /priorities/:id returns a priority (200) and 404 when missing', async () => {
    const created = await request(app.getHttpServer())
      .post('/priorities')
      .send({ name: 'High', level: 1 });

    await request(app.getHttpServer())
      .get(`/priorities/${created.body.id}`)
      .expect(200);

    await request(app.getHttpServer()).get('/priorities/missing').expect(404);
  });

  it('PATCH /priorities/:id updates (200), rejects invalid (400), 404 when missing', async () => {
    const created = await request(app.getHttpServer())
      .post('/priorities')
      .send({ name: 'Mid', level: 3 });

    const updated = await request(app.getHttpServer())
      .patch(`/priorities/${created.body.id}`)
      .send({ name: 'Middle' })
      .expect(200);

    expect(updated.body).toMatchObject({ name: 'Middle', level: 3 });

    await request(app.getHttpServer())
      .patch(`/priorities/${created.body.id}`)
      .send({ level: 'high' })
      .expect(400);

    await request(app.getHttpServer())
      .patch('/priorities/missing')
      .send({ name: 'x' })
      .expect(404);
  });

  it('DELETE /priorities/:id removes it, then GET returns 404; 404 when missing', async () => {
    const created = await request(app.getHttpServer())
      .post('/priorities')
      .send({ name: 'Temp', level: 9 });

    await request(app.getHttpServer())
      .delete(`/priorities/${created.body.id}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/priorities/${created.body.id}`)
      .expect(404);

    await request(app.getHttpServer()).delete('/priorities/missing').expect(404);
  });
});
