import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementsService } from '../plans/entitlements.service';
import { ListDrawsQueryDto } from './draws.dto';

type DrawWithSets = Prisma.DrawGetPayload<{
  include: {
    drawType: { select: { code: true; name: true } };
    numberSets: { include: { setType: { select: { code: true } } } };
  };
}>;

/** Lecture publique des tirages — UNIQUEMENT les tirages VALID. */
@Injectable()
export class DrawsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** Dernier tirage VALID de chaque type de tirage. */
  async latest() {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT ON (d.draw_type_id) d.id::text
      FROM core.draws d
      WHERE d.status = 'VALID'
      ORDER BY d.draw_type_id, d.draw_date DESC`;
    const draws = await this.prisma.draw.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      include: {
        drawType: { select: { code: true, name: true } },
        numberSets: { include: { setType: { select: { code: true } } } },
      },
      orderBy: [{ drawDate: 'desc' }],
    });
    return { data: draws.map((d) => this.serialize(d)) };
  }

  async list(userId: string | null, query: ListDrawsQueryDto) {
    const ent = await this.entitlements.forUser(userId);
    const from = this.entitlements.clampHistoryFrom(
      ent,
      query.from ? new Date(query.from) : undefined,
    );
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.DrawWhereInput = {
      status: 'VALID',
      ...(query.drawTypeCode ? { drawType: { code: query.drawTypeCode } } : {}),
      drawDate: {
        ...(from ? { gte: from } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.draw.findMany({
        where,
        include: {
          drawType: { select: { code: true, name: true } },
          numberSets: { include: { setType: { select: { code: true } } } },
        },
        orderBy: [{ drawDate: 'desc' }, { drawType: { code: 'asc' } }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.draw.count({ where }),
    ]);
    return {
      ...paginated(rows.map((d) => this.serialize(d)), page, limit, total),
      historyLimitedToDays: ent.history_days,
    };
  }

  async detail(id: string) {
    const draw = await this.prisma.draw.findUnique({
      where: { id },
      include: {
        drawType: { select: { code: true, name: true } },
        numberSets: { include: { setType: { select: { code: true } } } },
        source: { select: { code: true, label: true } },
      },
    });
    if (!draw || draw.status !== 'VALID') throw new NotFoundException('Tirage introuvable');
    return {
      ...this.serialize(draw),
      source: draw.source.code,
      collectedAt: draw.collectedAt,
    };
  }

  private serialize(draw: DrawWithSets) {
    const sets: Record<string, number[]> = {};
    for (const s of draw.numberSets) sets[s.setType.code] = s.numbers;
    return {
      id: draw.id,
      date: draw.drawDate.toISOString().slice(0, 10),
      drawType: draw.drawType,
      status: draw.status,
      numbers: sets,
    };
  }
}
