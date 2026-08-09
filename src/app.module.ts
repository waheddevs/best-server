import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { StudentsModule } from './students/students.module';
import { StudenstController } from './studenst/studenst.controller';

@Module({
  imports: [StudentsModule],
  controllers: [AppController, StudenstController],
  providers: [AppService],
})
export class AppModule {}
