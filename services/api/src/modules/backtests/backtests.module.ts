import { Module } from '@nestjs/common';
import { BacktestsController } from './backtests.controller';
import { BacktestsService } from './backtests.service';

@Module({
  controllers: [BacktestsController],
  providers: [BacktestsService],
})
export class BacktestsModule {}
