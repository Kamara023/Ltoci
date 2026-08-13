import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsObject, IsOptional, Matches, ValidateIf } from 'class-validator';
import { AdminManagementService } from './admin-management.service';
import { AdminTokenGuard } from './admin-token.guard';

class UpdateStrategyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ enum: ['FREE', 'PREMIUM', 'PRO'] })
  @IsOptional()
  @IsIn(['FREE', 'PREMIUM', 'PRO'])
  minPlan?: string;

  @ApiPropertyOptional({ description: 'Coefficients/fenêtres — appliqués sans déploiement' })
  @IsOptional()
  @IsObject()
  defaultConfig?: Record<string, unknown>;
}

class SetPlanDto {
  @ApiPropertyOptional({ enum: ['PREMIUM', 'PRO', null], description: 'null = retour FREE' })
  @ValidateIf((o) => o.planCode !== null)
  @IsIn(['PREMIUM', 'PRO'])
  planCode!: 'PREMIUM' | 'PRO' | null;
}

class UpdateDrawTypeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: '10:00', description: 'HH:mm ou null' })
  @IsOptional()
  @ValidateIf((o) => o.scheduledTime !== null)
  @Matches(/^\d{2}:\d{2}$/)
  scheduledTime?: string | null;
}

@ApiTags('admin-management')
@ApiHeader({ name: 'X-Admin-Token', description: "Token d'amorçage administrateur" })
@UseGuards(AdminTokenGuard)
@Controller('admin')
export class AdminManagementController {
  constructor(private readonly management: AdminManagementService) {}

  @Get('strategies')
  @ApiOperation({ summary: 'Toutes les stratégies avec configuration complète' })
  listStrategies() {
    return this.management.listStrategies();
  }

  @Patch('strategies/:code')
  @ApiOperation({ summary: 'Activer/désactiver, changer le plan minimum ou les coefficients' })
  updateStrategy(@Param('code') code: string, @Body() dto: UpdateStrategyDto) {
    return this.management.updateStrategy(code, dto);
  }

  @Get('users')
  @ApiOperation({ summary: 'Utilisateurs avec leur plan actif' })
  listUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.management.listUsers(page, Math.min(limit, 100), search);
  }

  @Put('users/:id/subscription')
  @ApiOperation({ summary: 'Attribuer PREMIUM/PRO ou revenir à FREE (null) — audité' })
  setPlan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetPlanDto) {
    return this.management.setUserPlan(id, dto.planCode);
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Historique des jobs planifiés (collecte, backtests)' })
  listJobs(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.management.listJobs(page, Math.min(limit, 100));
  }

  @Patch('draw-types/:code')
  @ApiOperation({ summary: 'Activer/désactiver un type de tirage ou fixer son horaire' })
  updateDrawType(@Param('code') code: string, @Body() dto: UpdateDrawTypeDto) {
    return this.management.updateDrawType(code, dto);
  }
}
