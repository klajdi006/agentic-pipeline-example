import { Module } from '@nestjs/common';
import { PrioritiesModule } from './priorities/priorities.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [TasksModule, PrioritiesModule],
})
export class AppModule {}
