import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

/** Entitlements d'un plan — cf. seed des plans (docs/06). */
export interface Entitlements {
  plan: string;
  history_days: number | null;
  windows: string[];
  strategies: string[];
  advanced_stats: boolean;
  backtesting: boolean;
  backtesting_run: boolean;
  ai_analyst: boolean;
  notifications: boolean;
  api_access: boolean;
  exports: boolean;
  rate_limit_per_min: number;
}

const FALLBACK_FREE: Entitlements = {
  plan: 'FREE',
  history_days: 30,
  windows: ['LAST_10', 'LAST_20'],
  strategies: ['STRATEGY_FREQUENCY'],
  advanced_stats: false,
  backtesting: false,
  backtesting_run: false,
  ai_analyst: false,
  notifications: false,
  api_access: false,
  exports: false,
  rate_limit_per_min: 30,
};

const CACHE_TTL = 60;

/**
 * Résolution du plan effectif : subscription ACTIVE non expirée sinon FREE.
 * Les requêtes ANONYMES reçoivent les entitlements du plan FREE.
 * Les droits sont des DONNÉES (plans.entitlements) — modifier un plan ne
 * demande aucun déploiement.
 */
@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async forUser(userId: string | null): Promise<Entitlements> {
    const cacheKey = `entitlements:${userId ?? 'anonymous'}`;
    try {
      const cached = await this.redis.client.get(cacheKey);
      if (cached) return JSON.parse(cached) as Entitlements;
    } catch {
      /* cache best-effort */
    }

    const planCode = userId ? await this.activePlanCode(userId) : 'FREE';
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    const entitlements: Entitlements = {
      ...FALLBACK_FREE,
      ...((plan?.entitlements as Partial<Entitlements>) ?? {}),
      plan: planCode,
    };

    try {
      await this.redis.client.setex(cacheKey, CACHE_TTL, JSON.stringify(entitlements));
    } catch {
      /* cache best-effort */
    }
    return entitlements;
  }

  private async activePlanCode(userId: string): Promise<string> {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { startedAt: 'desc' },
    });
    return sub?.planCode ?? 'FREE';
  }

  /** Vérifie qu'une fenêtre d'analyse est autorisée par le plan (403 sinon). */
  assertWindowAllowed(entitlements: Entitlements, window: string): void {
    const allowed = entitlements.windows;
    if (allowed.includes('*') || allowed.includes(window)) return;
    throw new ForbiddenException({
      code: 'WINDOW_NOT_ALLOWED',
      message:
        `La fenêtre ${window} n'est pas disponible avec votre plan ` +
        `(autorisées : ${allowed.join(', ')}). Passez au plan supérieur pour y accéder.`,
    });
  }

  /** Borne la date de début d'historique selon le plan (null = illimité). */
  clampHistoryFrom(entitlements: Entitlements, requested: Date | undefined): Date | undefined {
    if (entitlements.history_days === null) return requested;
    const floor = new Date();
    floor.setDate(floor.getDate() - entitlements.history_days);
    if (!requested || requested < floor) return floor;
    return requested;
  }
}
