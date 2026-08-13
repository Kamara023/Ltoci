import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CacheTTL } from '../../common/cache.decorator';
import { RedisCacheInterceptor } from '../../common/cache.interceptor';
import { AuthUser, CurrentUser, OptionalJwtGuard } from '../auth/jwt-auth.guard';
import { ForecastsService } from './forecasts.service';

@ApiTags('forecasts')
@Controller('forecasts')
@UseGuards(OptionalJwtGuard)
@UseInterceptors(RedisCacheInterceptor)
export class ForecastsController {
  constructor(private readonly forecasts: ForecastsService) {}

  @Get('next')
  @CacheTTL(120)
  @ApiOperation({
    summary:
      'TOP 5 par tirage à venir (figé avant tirage) — scores ≠ probabilités de gain',
  })
  next(@CurrentUser() user: AuthUser | null) {
    return this.forecasts.next(user?.id ?? null);
  }

  @Get('history')
  @CacheTTL(120)
  @ApiOperation({ summary: 'Prévisions évaluées (immuables) avec le résultat réel et les hits' })
  history(
    @CurrentUser() user: AuthUser | null,
    @Query('drawType') drawType?: string,
    @Query('limit') limit?: string,
  ) {
    return this.forecasts.history(user?.id ?? null, drawType, limit ? Number(limit) : 50);
  }

  @Get('performance')
  @CacheTTL(300)
  @ApiOperation({
    summary: 'Performance réelle accumulée vs baseline aléatoire (≈ 0,278 hit/top-5)',
  })
  performance(@CurrentUser() user: AuthUser | null) {
    return this.forecasts.performance(user?.id ?? null);
  }
}
