import { Module } from '@nestjs/common';
import { PlansModule } from '../plans/plans.module';
import { ForecastsController } from './forecasts.controller';
import { ForecastsService } from './forecasts.service';

@Module({
  imports: [PlansModule],
  controllers: [ForecastsController],
  providers: [ForecastsService],
})
export class ForecastsModule {}
