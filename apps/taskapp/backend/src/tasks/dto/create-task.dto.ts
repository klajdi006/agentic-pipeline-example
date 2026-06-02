import { IsEnum, IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { TaskPriority } from '../task.model';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsISO8601()
  deadline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  assignee?: string;
}
