import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateTaskDto } from './dto/create-task.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post()
  create(@Body() dto: CreateTaskDto) {
    return this.tasks.create(dto);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.tasks.findAll(query.page, query.limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tasks.findOne(id);
  }

  @Patch(':id/complete')
  complete(@Param('id') id: string) {
    return this.tasks.setCompleted(id, true);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    this.tasks.remove(id);
    return { ok: true };
  }
}
