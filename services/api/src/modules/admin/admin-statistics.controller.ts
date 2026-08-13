import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MlClientService } from '../ml-client/ml-client.service';
import { AdminTokenGuard } from './admin-token.guard';

@ApiTags('admin-statistics')
@ApiHeader({ name: 'X-Admin-Token', description: "Token d'amorçage administrateur (PHASE 2)" })
@UseGuards(AdminTokenGuard)
@Controller('admin')
export class AdminStatisticsController {
  constructor(private readonly ml: MlClientService) {}

  @Post('statistics/refresh')
  @ApiOperation({ summary: 'Recalculer toutes les statistiques matérialisées (service ML)' })
  refresh() {
    return this.ml.refreshStatistics('admin');
  }

  @Get('statistics/status')
  @ApiOperation({ summary: 'Fraîcheur des statistiques (computed_at, as_of, volumes)' })
  status() {
    return this.ml.statisticsStatus();
  }

  @Post('predictions/generate')
  @ApiOperation({ summary: 'Régénérer les combinaisons candidates (service ML)' })
  generatePredictions() {
    return this.ml.generatePredictions('admin');
  }
}
