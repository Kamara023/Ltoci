import { Module } from '@nestjs/common';
import { DrawsController } from './draws.controller';
import { DrawsService } from './draws.service';

@Module({
  controllers: [DrawsController],
  providers: [DrawsService],
})
export class DrawsModule {}
