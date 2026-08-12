import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDrawDto } from './dto/create-draw.dto';

const MANUAL_SOURCE = 'manual-admin';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ---------- Saisie manuelle ----------

  async createDraw(dto: CreateDrawDto) {
    const gameCode = dto.gameCode ?? 'loto-bonheur';
    const game = await this.prisma.game.findUnique({ where: { code: gameCode } });
    if (!game) throw new NotFoundException(`Jeu inconnu : ${gameCode}`);

    const drawType = await this.prisma.drawType.findUnique({
      where: { gameId_code: { gameId: game.id, code: dto.drawTypeCode } },
    });
    if (!drawType) throw new NotFoundException(`Type de tirage inconnu : ${dto.drawTypeCode}`);

    const source = await this.prisma.dataSource.findUnique({ where: { code: MANUAL_SOURCE } });
    if (!source) throw new NotFoundException(`Source ${MANUAL_SOURCE} absente du seed`);

    const setTypes = await this.prisma.gameNumberSetType.findMany({
      where: { gameId: game.id },
    });
    const setTypeId = (code: string) => setTypes.find((s) => s.code === code)?.id;
    const winningSetId = setTypeId('WINNING');
    if (!winningSetId) throw new NotFoundException('Ensemble WINNING non configuré pour ce jeu');

    try {
      const draw = await this.prisma.$transaction(async (tx) => {
        const created = await tx.draw.create({
          data: {
            gameId: game.id,
            drawTypeId: drawType.id,
            drawDate: new Date(dto.drawDate),
            drawTime: dto.drawTime ? new Date(`1970-01-01T${dto.drawTime}:00Z`) : null,
            sourceId: source.id,
            collectedAt: new Date(),
            metadata: { manualEntry: true },
            numberSets: {
              create: [
                { setTypeId: winningSetId, numbers: dto.winningNumbers },
                ...(dto.machineNumbers && setTypeId('MACHINE')
                  ? [{ setTypeId: setTypeId('MACHINE')!, numbers: dto.machineNumbers }]
                  : []),
              ],
            },
          },
          include: { numberSets: true, drawType: true },
        });
        await tx.auditLog.create({
          data: {
            action: 'draw.manual_create',
            entityType: 'draw',
            entityId: created.id,
            after: JSON.parse(JSON.stringify(dto)),
          },
        });
        return created;
      });
      return draw;
    } catch (err) {
      throw this.mapDrawError(err);
    }
  }

  private mapDrawError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException(
        'Un tirage existe déjà pour ce jeu, ce type et cette date (clé naturelle unique)',
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    // Erreurs levées par le trigger SQL d'intégrité des ensembles.
    const known = ['BAD_CARDINALITY', 'OUT_OF_RANGE', 'DUP_IN_SET'];
    const hit = known.find((k) => message.includes(k));
    if (hit) {
      const detail = message.split('\n').find((l) => l.includes(hit)) ?? hit;
      return new BadRequestException(`Numéros invalides — ${detail.trim()}`);
    }
    return err as Error;
  }

  // ---------- Proxy vers le service ingestion ----------

  private ingestionHeaders(): Record<string, string> {
    return { 'X-Internal-Token': this.config.getOrThrow<string>('INGESTION_SERVICE_TOKEN') };
  }

  private ingestionUrl(path: string): string {
    return `${this.config.getOrThrow<string>('INGESTION_SERVICE_URL')}${path}`;
  }

  async triggerCollect(mode: 'latest' | 'backfill', months?: string[], triggeredBy = 'manual') {
    let response: Response;
    try {
      response = await fetch(this.ingestionUrl('/internal/ingestion/collect'), {
        method: 'POST',
        headers: { ...this.ingestionHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, months, triggered_by: triggeredBy }),
      });
    } catch (err) {
      throw new BadGatewayException(`Service ingestion injoignable : ${(err as Error).message}`);
    }
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new BadGatewayException(
        `Ingestion a répondu ${response.status} : ${JSON.stringify(body)}`,
      );
    }
    return body;
  }

  async forwardImport(file: Express.Multer.File, sourceCode: string) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file.buffer)]), file.originalname);
    form.append('source_code', sourceCode);
    form.append('triggered_by', 'manual');
    let response: Response;
    try {
      response = await fetch(this.ingestionUrl('/internal/ingestion/import'), {
        method: 'POST',
        headers: this.ingestionHeaders(),
        body: form,
      });
    } catch (err) {
      throw new BadGatewayException(`Service ingestion injoignable : ${(err as Error).message}`);
    }
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new BadGatewayException(
        `Import refusé par l'ingestion (${response.status}) : ${JSON.stringify(body)}`,
      );
    }
    return body;
  }

  // ---------- Surveillance des runs ----------

  async listRuns(page = 1, limit = 20) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.ingestionRun.findMany({
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { source: { select: { code: true, label: true, kind: true } } },
      }),
      this.prisma.ingestionRun.count(),
    ]);
    return { data, meta: { page, limit, total } };
  }

  async listRunEvents(runId: string, page = 1, limit = 100) {
    const run = await this.prisma.ingestionRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException(`Run inconnu : ${runId}`);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.ingestionEvent.findMany({
        where: { runId },
        orderBy: { id: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ingestionEvent.count({ where: { runId } }),
    ]);
    return {
      run,
      data: data.map((e) => ({ ...e, id: e.id.toString() })),
      meta: { page, limit, total },
    };
  }
}
