import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class CreatePriorityDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsInt()
  @Min(0)
  level!: number;
}
