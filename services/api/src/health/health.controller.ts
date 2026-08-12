import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface HealthReport {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  redis: 'up' | 'down';
  version: string;
  timestamp: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: "État de l'API et de ses dépendances (PostgreSQL, Redis)" })
  @ApiOkResponse({ description: 'Rapport de santé' })
  async check(): Promise<HealthReport> {
    const [dbUp, redisUp] = await Promise.all([this.isDbUp(), this.redis.isUp()]);
    return {
      status: dbUp && redisUp ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
      redis: redisUp ? 'up' : 'down',
      version: process.env.npm_package_version ?? '0.1.0',
      timestamp: new Date().toISOString(),
    };
  }

  private async isDbUp(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
