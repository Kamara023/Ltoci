import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { STATISTICAL_DISCLAIMER } from '@lotostats/types';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementsService } from '../plans/entitlements.service';

/**
 * Lecture des combinaisons candidates générées par le service ML.
 * Gating : entitlements.strategies (FREE = FREQUENCY seule, PRO = '*').
 * Invariant : toute réponse porte le disclaimer statistique.
 */
@Injectable()
export class PredictionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async listStrategies() {
    const rows = await this.prisma.strategy.findMany({
      orderBy: [{ minPlan: 'asc' }, { code: 'asc' }],
      select: { code: true, name: true, description: true, minPlan: true, isEnabled: true },
    });
    return { data: rows, disclaimer: STATISTICAL_DISCLAIMER };
  }

  private async allowedStrategyCodes(userId: string | null): Promise<string[] | '*'> {
    const ent = await this.entitlements.forUser(userId);
    return ent.strategies.includes('*') ? '*' : ent.strategies;
  }

  async list(userId: string | null, strategy?: string, date?: string) {
    const allowed = await this.allowedStrategyCodes(userId);
    if (strategy && allowed !== '*' && !allowed.includes(strategy)) {
      throw new ForbiddenException({
        code: 'STRATEGY_NOT_ALLOWED',
        message: `La stratégie ${strategy} n'est pas incluse dans votre plan.`,
      });
    }

    const targetDate = date
      ? new Date(date)
      : (
          await this.prisma.prediction.findFirst({
            orderBy: { targetDrawDate: 'desc' },
            select: { targetDrawDate: true },
          })
        )?.targetDrawDate;
    if (!targetDate) return { data: [], disclaimer: STATISTICAL_DISCLAIMER };

    const rows = await this.prisma.prediction.findMany({
      where: {
        targetDrawDate: targetDate,
        drawTypeId: null,
        strategy: {
          ...(strategy ? { code: strategy } : {}),
          ...(allowed === '*' ? {} : { code: { in: strategy ? [strategy] : allowed } }),
        },
      },
      include: {
        strategy: { select: { code: true, name: true, minPlan: true } },
        _count: { select: { combinations: true } },
      },
      orderBy: { strategy: { code: 'asc' } },
    });
    return {
      data: rows.map((p) => ({
        id: p.id,
        strategy: p.strategy,
        targetDrawDate: p.targetDrawDate.toISOString().slice(0, 10),
        generatedAt: p.generatedAt,
        combinations: p._count.combinations,
      })),
      disclaimer: STATISTICAL_DISCLAIMER,
    };
  }

  async detail(userId: string | null, id: string) {
    const prediction = await this.prisma.prediction.findUnique({
      where: { id },
      include: {
        strategy: { select: { code: true, name: true, description: true, minPlan: true } },
        combinations: { orderBy: { rank: 'asc' } },
      },
    });
    if (!prediction) throw new NotFoundException('Génération introuvable');

    const allowed = await this.allowedStrategyCodes(userId);
    if (allowed !== '*' && !allowed.includes(prediction.strategy.code)) {
      throw new ForbiddenException({
        code: 'STRATEGY_NOT_ALLOWED',
        message: `La stratégie ${prediction.strategy.code} n'est pas incluse dans votre plan.`,
      });
    }
    return {
      id: prediction.id,
      strategy: prediction.strategy,
      targetDrawDate: prediction.targetDrawDate.toISOString().slice(0, 10),
      generatedAt: prediction.generatedAt,
      datasetCutoffDrawId: prediction.datasetCutoffDrawId,
      configUsed: prediction.configUsed,
      combinations: prediction.combinations.map((c) => ({
        rank: c.rank,
        numbers: c.numbers,
        score: Number(c.score),
        breakdown: c.scoreBreakdown,
        explanation: c.explanation,
      })),
      disclaimer: STATISTICAL_DISCLAIMER,
    };
  }
}
