import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CreatePriorityDto } from './dto/create-priority.dto';
import { UpdatePriorityDto } from './dto/update-priority.dto';
import { PrioritiesController } from './priorities.controller';
import { PrioritiesService } from './priorities.service';

/**
 * Controller-level spec for the priorities resource.
 *
 * Unlike `priorities.e2e-spec.ts` (which lives outside the unit `rootDir` and needs
 * `supertest`), this runs in-process with the standard `npm test` toolchain. It exercises
 * each acceptance criterion of TASK-142 through the controller + a real `ValidationPipe`,
 * so the HTTP-status semantics are verified without a running server:
 *   - `ValidationPipe` rejects bad input with `BadRequestException` (HTTP 400)
 *   - `NotFoundException` (HTTP 404) is thrown for unknown ids
 */
describe('PrioritiesController', () => {
  let controller: PrioritiesController;
  let service: PrioritiesService;
  // Mirrors the global pipe registered in main.ts / the e2e bootstrap.
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PrioritiesController],
      providers: [PrioritiesService],
    }).compile();

    controller = moduleRef.get(PrioritiesController);
    service = moduleRef.get(PrioritiesService);
  });

  // AC1 — POST with a valid payload returns the created priority (id + submitted fields).
  it('AC1: creates a priority with a generated id and the submitted fields', () => {
    const created = controller.create({ name: 'Urgent', level: 0 });

    expect(created.id).toEqual(expect.any(String));
    expect(created.id).not.toHaveLength(0);
    expect(created).toMatchObject({ name: 'Urgent', level: 0 });
    // createdAt is a UTC ISO-8601 string (round-trips through Date).
    expect(created.createdAt).toBe(new Date(created.createdAt).toISOString());
    // Persisted.
    expect(controller.findAll()).toHaveLength(1);
  });

  // AC2 — an invalid create is rejected (400) and nothing is persisted.
  it('AC2: rejects an invalid create payload with 400 and does not persist it', async () => {
    await expect(
      pipe.transform({ name: '', level: -1 }, { type: 'body', metatype: CreatePriorityDto }),
    ).rejects.toThrow(BadRequestException);

    // The pipe runs before the handler, so the store is never touched.
    expect(controller.findAll()).toHaveLength(0);
  });

  // AC3 — GET list returns every stored priority.
  it('AC3: lists all stored priorities', () => {
    controller.create({ name: 'A', level: 1 });
    controller.create({ name: 'B', level: 2 });

    const all = controller.findAll();
    expect(Array.isArray(all)).toBe(true);
    expect(all.map((p) => p.name).sort()).toEqual(['A', 'B']);
  });

  // AC4 — GET by id returns the matching priority.
  it('AC4: returns a single priority by id', () => {
    const created = controller.create({ name: 'High', level: 0 });
    expect(controller.findOne(created.id)).toEqual(created);
  });

  // AC5 — get / update / delete against an unknown id all respond 404 without side effects.
  it('AC5: responds 404 for get, update, and delete of a missing id', () => {
    expect(() => controller.findOne('missing')).toThrow(NotFoundException);
    expect(() => controller.update('missing', { name: 'x' })).toThrow(NotFoundException);
    expect(() => controller.remove('missing')).toThrow(NotFoundException);
    expect(controller.findAll()).toHaveLength(0);
  });

  // AC6 — PATCH with a valid payload reflects the change and preserves unchanged fields.
  it('AC6: updates the provided fields and preserves the rest', () => {
    const created = controller.create({ name: 'Mid', level: 3 });

    const updated = controller.update(created.id, { name: 'Middle' });

    expect(updated.name).toBe('Middle'); // changed
    expect(updated.level).toBe(3); // preserved
    expect(updated.id).toBe(created.id); // preserved
    expect(updated.createdAt).toBe(created.createdAt); // preserved
    // Persisted through the store.
    expect(controller.findOne(created.id)).toMatchObject({ name: 'Middle', level: 3 });
  });

  // AC7 — an invalid update is rejected (400) and the stored priority is unchanged.
  it('AC7: rejects an invalid update with 400 and leaves the stored priority unchanged', async () => {
    const created = controller.create({ name: 'Mid', level: 3 });

    await expect(
      pipe.transform({ level: 'high' }, { type: 'body', metatype: UpdatePriorityDto }),
    ).rejects.toThrow(BadRequestException);

    expect(service.findOne(created.id)).toMatchObject({ name: 'Mid', level: 3 });
  });

  // AC8 — DELETE removes the priority; a later GET responds 404.
  it('AC8: deletes a priority so a subsequent get responds 404', () => {
    const created = controller.create({ name: 'Temp', level: 9 });

    expect(controller.remove(created.id)).toEqual({ ok: true });
    expect(() => controller.findOne(created.id)).toThrow(NotFoundException);
  });
});
