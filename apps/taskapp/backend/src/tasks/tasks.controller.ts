import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { tasksToCsv } from './csv.utils';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
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

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="tasks.csv"')
  exportCsv() {
    return tasksToCsv(this.tasks.findAllForExport());
  }

  @Get('summary')
  getSummary() {
    return this.tasks.getSummary();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tasks.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(id, dto);
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
