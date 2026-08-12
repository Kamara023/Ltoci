import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminTokenGuard } from './admin-token.guard';
import { AdminQualityService } from './admin-quality.service';
import {
  InvalidateDrawDto,
  QualityRunDto,
  ResolveIssueDto,
  UpdateDrawNumbersDto,
} from './dto/quality.dto';

@ApiTags('admin-quality')
@ApiHeader({ name: 'X-Admin-Token', description: "Token d'amorçage administrateur (PHASE 2)" })
@UseGuards(AdminTokenGuard)
@Controller('admin')
export class AdminQualityController {
  constructor(private readonly quality: AdminQualityService) {}

  @Get('quality/summary')
  @ApiOperation({ summary: 'Répartition des statuts de tirages et issues ouvertes par règle' })
  summary() {
    return this.quality.summary();
  }

  @Get('quality/issues')
  @ApiOperation({ summary: 'File de revue : issues de qualité (filtres resolved/ruleCode/severity)' })
  listIssues(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('resolved') resolved?: string,
    @Query('ruleCode') ruleCode?: string,
    @Query('severity') severity?: string,
  ) {
    return this.quality.listIssues(page, Math.min(limit, 100), {
      resolved: resolved === undefined ? undefined : resolved === 'true',
      ruleCode,
      severity,
    });
  }

  @Post('quality/issues/:id/resolve')
  @ApiOperation({ summary: 'Résoudre une issue (note obligatoire) puis re-contrôler le tirage' })
  resolveIssue(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveIssueDto) {
    return this.quality.resolveIssue(id, dto.note);
  }

  @Post('quality/run')
  @ApiOperation({ summary: 'Lancer le contrôle qualité (pending ou all) via le service ingestion' })
  run(@Body() dto: QualityRunDto) {
    return this.quality.runQuality(dto.scope ?? 'pending');
  }

  @Post('draws/:id/validate')
  @ApiOperation({ summary: 'Valider manuellement un tirage (résout ses issues, prime sur le moteur)' })
  validate(@Param('id', ParseUUIDPipe) id: string) {
    return this.quality.validateDraw(id);
  }

  @Post('draws/:id/invalidate')
  @ApiOperation({ summary: 'Invalider manuellement un tirage (motif obligatoire, audité)' })
  invalidate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: InvalidateDrawDto) {
    return this.quality.invalidateDraw(id, dto.reason);
  }

  @Patch('draws/:id/numbers')
  @ApiOperation({
    summary:
      'Corriger les numéros d’un tirage — trigger SQL revalide/trie, retour en PENDING_REVIEW puis re-contrôle',
  })
  correct(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDrawNumbersDto) {
    return this.quality.updateDrawNumbers(id, dto);
  }
}
