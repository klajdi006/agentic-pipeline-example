import { IsEnum, IsOptional } from 'class-validator';
import { TaskPriority } from '../task.model';

export class UpdateTaskDto {
  @IsOptional()
  @IsEnum(TaskPriority, { message: 'priority must be one of low, medium, high' })
  priority?: TaskPriority;
}
