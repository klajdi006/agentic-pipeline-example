import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreatePriorityDto } from './dto/create-priority.dto';
import { UpdatePriorityDto } from './dto/update-priority.dto';
import { PrioritiesService } from './priorities.service';

describe('PrioritiesService', () => {
  let service: PrioritiesService;

  beforeEach(() => {
    service = new PrioritiesService();
  });

  it('creates a priority with an id and a UTC ISO-8601 createdAt', () => {
    const priority = service.create({ name: 'Urgent', level: 0 });

    expect(priority.id).toBeDefined();
    expect(priority.name).toBe('Urgent');
    expect(priority.level).toBe(0);
    // createdAt must round-trip as a UTC ISO string (no local-time storage)
    expect(priority.createdAt).toBe(new Date(priority.createdAt).toISOString());
  });

  it('lists all created priorities', () => {
    service.create({ name: 'A', level: 1 });
    service.create({ name: 'B', level: 2 });
    expect(service.findAll()).toHaveLength(2);
  });

  it('gets a priority by id', () => {
    const created = service.create({ name: 'High', level: 0 });
    expect(service.findOne(created.id)).toEqual(created);
  });

  it('throws NotFound for a missing priority on get', () => {
    expect(() => service.findOne('missing')).toThrow(NotFoundException);
  });

  describe('update', () => {
    it('changes only the provided fields and preserves the rest', () => {
      const created = service.create({ name: 'Low', level: 5 });

      const updated = service.update(created.id, { name: 'Lowest' });

      expect(updated.name).toBe('Lowest'); // changed
      expect(updated.level).toBe(5); // preserved
      expect(updated.id).toBe(created.id); // preserved
      expect(updated.createdAt).toBe(created.createdAt); // preserved
    });

    it('updates the numeric level while preserving the name', () => {
      const created = service.create({ name: 'Mid', level: 3 });

      const updated = service.update(created.id, { level: 1 });

      expect(updated.level).toBe(1);
      expect(updated.name).toBe('Mid');
    });

    it('persists the update through the store', () => {
      const created = service.create({ name: 'Mid', level: 3 });
      service.update(created.id, { name: 'Middle', level: 2 });

      expect(service.findOne(created.id)).toMatchObject({ name: 'Middle', level: 2 });
    });

    it('throws NotFound when updating a missing priority', () => {
      expect(() => service.update('missing', { name: 'x' })).toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes a priority so a later get throws NotFound', () => {
      const created = service.create({ name: 'Temp', level: 9 });

      service.remove(created.id);

      expect(service.findAll()).toHaveLength(0);
      expect(() => service.findOne(created.id)).toThrow(NotFoundException);
    });

    it('throws NotFound when removing a missing priority', () => {
      expect(() => service.remove('missing')).toThrow(NotFoundException);
    });
  });

  describe('DTO validation', () => {
    it('rejects a create with a missing name and a negative level', () => {
      const dto = plainToInstance(CreatePriorityDto, { level: -1 });
      const errors = validateSync(dto);

      expect(errors.some((e) => e.property === 'name')).toBe(true);
      expect(errors.some((e) => e.property === 'level')).toBe(true);
    });

    it('accepts a fully optional (empty) update', () => {
      const dto = plainToInstance(UpdatePriorityDto, {});
      expect(validateSync(dto)).toHaveLength(0);
    });

    it('rejects an update with an invalid level', () => {
      const dto = plainToInstance(UpdatePriorityDto, { level: 'high' });
      const errors = validateSync(dto);
      expect(errors.some((e) => e.property === 'level')).toBe(true);
    });
  });
});
