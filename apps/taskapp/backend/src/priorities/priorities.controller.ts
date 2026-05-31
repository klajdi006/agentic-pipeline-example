import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CreatePriorityDto } from './dto/create-priority.dto';
import { UpdatePriorityDto } from './dto/update-priority.dto';
import { PrioritiesService } from './priorities.service';

@Controller('priorities')
export class PrioritiesController {
  constructor(private readonly priorities: PrioritiesService) {}

  @Post()
  create(@Body() dto: CreatePriorityDto) {
    return this.priorities.create(dto);
  }

  @Get()
  findAll() {
    return this.priorities.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.priorities.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePriorityDto) {
    return this.priorities.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    this.priorities.remove(id);
    return { ok: true };
  }
}
