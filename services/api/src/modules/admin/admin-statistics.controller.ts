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

  @Post('backtests/run')
  @ApiOperation({ summary: 'Relancer le backtest complet des stratégies (service ML)' })
  runBacktests() {
    return this.ml.runBacktests('admin');
  }

  @Post('forecasts/generate')
  @ApiOperation({ summary: 'Générer les prévisions TOP 5 des prochains tirages (service ML)' })
  generateForecasts() {
    return this.ml.generateForecasts('admin');
  }

  @Post('forecasts/evaluate')
  @ApiOperation({ summary: 'Évaluer les prévisions dont le tirage cible est arrivé' })
  evaluateForecasts() {
    return this.ml.evaluateForecasts('admin');
  }

  @Get('forecasts/status')
  @ApiOperation({ summary: 'État des prévisions (actives, évaluées, dernière génération)' })
  forecastsStatus() {
    return this.ml.forecastsStatus();
  }
}
