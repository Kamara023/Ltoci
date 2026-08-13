import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CacheTTL } from '../../common/cache.decorator';
import { RedisCacheInterceptor } from '../../common/cache.interceptor';
import { OptionalJwtGuard } from '../auth/jwt-auth.guard';
import { MlClientService } from '../ml-client/ml-client.service';
import { EntitlementsGuard, RequireEntitlement } from '../plans/entitlements.guard';
import { BacktestsService } from './backtests.service';

@ApiTags('backtests')
@Controller('backtests')
@UseGuards(OptionalJwtGuard, EntitlementsGuard)
@UseInterceptors(RedisCacheInterceptor)
export class BacktestsController {
  constructor(
    private readonly backtests: BacktestsService,
    private readonly ml: MlClientService,
  ) {}

  @Get()
  @CacheTTL(300)
  @RequireEntitlement('backtesting')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Comparatif des stratégies vs baseline aléatoire (walk-forward) — plan PREMIUM+',
  })
  list() {
    return this.backtests.list();
  }

  @Get(':id')
  @CacheTTL(300)
  @RequireEntitlement('backtesting')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Détail : distribution 0→5, par année, p-value (plan PREMIUM+)' })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.backtests.detail(id);
  }

  @Post('run')
  @RequireEntitlement('backtesting_run')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Relancer le backtest complet (plan PRO)' })
  run() {
    return this.ml.runBacktests('pro-user');
  }
}
