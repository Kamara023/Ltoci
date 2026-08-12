import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminTokenGuard } from './admin-token.guard';
import { AdminService } from './admin.service';
import { CollectDto } from './dto/collect.dto';
import { CreateDrawDto } from './dto/create-draw.dto';

@ApiTags('admin')
@ApiHeader({ name: 'X-Admin-Token', description: "Token d'amorçage administrateur (PHASE 2)" })
@UseGuards(AdminTokenGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post('draws')
  @ApiOperation({ summary: "Saisie manuelle d'un tirage (source manual-admin, auditée)" })
  createDraw(@Body() dto: CreateDrawDto) {
    return this.admin.createDraw(dto);
  }

  @Post('ingestion/collect')
  @ApiOperation({ summary: 'Déclencher une collecte (latest) ou un backfill (tâche de fond)' })
  collect(@Body() body: CollectDto) {
    return this.admin.triggerCollect(body.mode ?? 'latest', body.months, 'manual');
  }

  @Post('imports')
  @ApiOperation({ summary: 'Importer un fichier CSV / Excel / JSON de tirages' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        sourceCode: { type: 'string', example: 'csv-import' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  import(@UploadedFile() file: Express.Multer.File, @Body('sourceCode') sourceCode: string) {
    return this.admin.forwardImport(file, sourceCode ?? 'csv-import');
  }

  @Get('ingestion/runs')
  @ApiOperation({ summary: "Historique des opérations d'ingestion" })
  listRuns(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.admin.listRuns(page, Math.min(limit, 100));
  }

  @Get('ingestion/runs/:id/events')
  @ApiOperation({ summary: "Événements détaillés d'un run d'ingestion" })
  listRunEvents(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    return this.admin.listRunEvents(id, page, Math.min(limit, 500));
  }
}
