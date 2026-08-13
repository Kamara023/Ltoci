import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from './common/rate-limit.guard';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { DrawsModule } from './modules/draws/draws.module';
import { GamesModule } from './modules/games/games.module';
import { MlClientModule } from './modules/ml-client/ml-client.module';
import { PlansModule } from './modules/plans/plans.module';
import { PredictionsModule } from './modules/predictions/predictions.module';
import { StatisticsModule } from './modules/statistics/statistics.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // En dev, le .env vit à la racine du monorepo ; en CI/prod les variables
      // sont injectées directement dans l'environnement.
      envFilePath: ['../../.env', '.env'],
      validate: validateEnv,
    }),
    PrismaModule,
    RedisModule,
    MlClientModule,
    PlansModule,
    AuthModule,
    HealthModule,
    GamesModule,
    DrawsModule,
    StatisticsModule,
    PredictionsModule,
    AdminModule,
    JobsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class AppModule {}
