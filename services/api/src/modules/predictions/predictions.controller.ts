import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CacheTTL } from '../../common/cache.decorator';
import { RedisCacheInterceptor } from '../../common/cache.interceptor';
import { AuthUser, CurrentUser, OptionalJwtGuard } from '../auth/jwt-auth.guard';
import { PredictionsService } from './predictions.service';

@ApiTags('predictions')
@Controller()
@UseGuards(OptionalJwtGuard)
@UseInterceptors(RedisCacheInterceptor)
export class PredictionsController {
  constructor(private readonly predictions: PredictionsService) {}

  @Get('strategies')
  @CacheTTL(300)
  @ApiOperation({ summary: 'Catalogue honnête des stratégies (description, plan minimum)' })
  strategies() {
    return this.predictions.listStrategies();
  }

  @Get('predictions')
  @CacheTTL(120)
  @ApiOperation({
    summary:
      'Générations de combinaisons candidates (filtrées par plan) — les scores ne sont PAS des probabilités',
  })
  list(
    @CurrentUser() user: AuthUser | null,
    @Query('strategy') strategy?: string,
    @Query('date') date?: string,
  ) {
    return this.predictions.list(user?.id ?? null, strategy, date);
  }

  @Get('predictions/:id')
  @CacheTTL(120)
  @ApiOperation({ summary: 'Détail : combinaisons, score décomposé, explication, disclaimer' })
  detail(@CurrentUser() user: AuthUser | null, @Param('id', ParseUUIDPipe) id: string) {
    return this.predictions.detail(user?.id ?? null, id);
  }
}
