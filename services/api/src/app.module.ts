import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { AdminModule } from './modules/admin/admin.module';
import { MlClientModule } from './modules/ml-client/ml-client.module';
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
    HealthModule,
    AdminModule,
    JobsModule,
  ],
})
export class AppModule {}
