import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CacheTTL } from '../../common/cache.decorator';
import { RedisCacheInterceptor } from '../../common/cache.interceptor';
import { AuthUser, CurrentUser, OptionalJwtGuard } from '../auth/jwt-auth.guard';
import { EntitlementsGuard, RequireEntitlement } from '../plans/entitlements.guard';
import { StatsQueryDto } from './statistics.dto';
import { StatisticsService } from './statistics.service';

@ApiTags('statistics')
@Controller('statistics')
@UseGuards(OptionalJwtGuard, EntitlementsGuard)
@UseInterceptors(RedisCacheInterceptor)
export class StatisticsController {
  constructor(private readonly stats: StatisticsService) {}

  @Get('frequencies')
  @CacheTTL(120)
  @ApiOperation({ summary: 'Fréquences des 90 numéros (fenêtre bornée par le plan)' })
  frequencies(@CurrentUser() user: AuthUser | null, @Query() query: StatsQueryDto) {
    return this.stats.frequencies(user?.id ?? null, query);
  }

  @Get('hot')
  @CacheTTL(120)
  @ApiOperation({ summary: 'Numéros les plus fréquents — indicateur DESCRIPTIF (disclaimer inclus)' })
  hot(@CurrentUser() user: AuthUser | null, @Query() query: StatsQueryDto) {
    return this.stats.hotOrCold(user?.id ?? null, query, 'hot');
  }

  @Get('cold')
  @CacheTTL(120)
  @ApiOperation({ summary: 'Numéros les moins fréquents — un numéro froid n’est PAS « dû »' })
  cold(@CurrentUser() user: AuthUser | null, @Query() query: StatsQueryDto) {
    return this.stats.hotOrCold(user?.id ?? null, query, 'cold');
  }

  @Get('delays')
  @CacheTTL(120)
  @RequireEntitlement('advanced_stats')
  @ApiOperation({ summary: 'Retards actuels/moyens/max par numéro (plan PREMIUM+)' })
  delays(@CurrentUser() user: AuthUser | null, @Query() query: StatsQueryDto) {
    return this.stats.delays(user?.id ?? null, query);
  }

  @Get('trends')
  @CacheTTL(120)
  @RequireEntitlement('advanced_stats')
  @ApiOperation({ summary: 'Tendances de fréquence (pente) par numéro (plan PREMIUM+)' })
  trends(@CurrentUser() user: AuthUser | null, @Query() query: StatsQueryDto) {
    return this.stats.trends(user?.id ?? null, query);
  }

  @Get('pairs')
  @CacheTTL(120)
  @RequireEntitlement('advanced_stats')
  @ApiOperation({ summary: 'Paires fréquentes avec lift (plan PREMIUM+)' })
  pairs(@CurrentUser() user: AuthUser | null, @Query() query: StatsQueryDto) {
    return this.stats.pairs(user?.id ?? null, query);
  }

  @Get('shapes')
  @CacheTTL(120)
  @RequireEntitlement('advanced_stats')
  @ApiOperation({
    summary: 'Formes de tirage : sommes, pair/impair, haut/bas, consécutifs, répétitions (PREMIUM+)',
  })
  shapes(@CurrentUser() user: AuthUser | null, @Query() query: StatsQueryDto) {
    return this.stats.shapes(user?.id ?? null, query);
  }
}
