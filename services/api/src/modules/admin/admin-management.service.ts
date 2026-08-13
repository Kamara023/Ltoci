import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

/**
 * Gestion backoffice : stratégies (coefficients à chaud), utilisateurs
 * (attribution de plan), jobs planifiés, types de tirage. Tout est audité.
 */
@Injectable()
export class AdminManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ---------- Stratégies ----------

  async listStrategies() {
    return {
      data: await this.prisma.strategy.findMany({ orderBy: [{ minPlan: 'asc' }, { code: 'asc' }] }),
    };
  }

  async updateStrategy(
    code: string,
    patch: { isEnabled?: boolean; minPlan?: string; defaultConfig?: unknown },
  ) {
    const strategy = await this.prisma.strategy.findUnique({ where: { code } });
    if (!strategy) throw new NotFoundException(`Stratégie inconnue : ${code}`);
    if (patch.minPlan && !['FREE', 'PREMIUM', 'PRO'].includes(patch.minPlan)) {
      throw new BadRequestException('minPlan doit être FREE, PREMIUM ou PRO');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.strategy.update({
        where: { code },
        data: {
          ...(patch.isEnabled !== undefined ? { isEnabled: patch.isEnabled } : {}),
          ...(patch.minPlan ? { minPlan: patch.minPlan } : {}),
          ...(patch.defaultConfig !== undefined
            ? { defaultConfig: patch.defaultConfig as Prisma.InputJsonValue }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'strategy.update',
          entityType: 'strategy',
          entityId: strategy.id,
          before: {
            isEnabled: strategy.isEnabled,
            minPlan: strategy.minPlan,
            defaultConfig: strategy.defaultConfig as object,
          },
          after: JSON.parse(JSON.stringify(patch)),
        },
      });
      return res;
    });
    await this.purgeCaches();
    return updated;
  }

  // ---------- Utilisateurs ----------

  async listUsers(page: number, limit: number, search?: string) {
    const where: Prisma.UserWhereInput = search
      ? { email: { contains: search.toLowerCase() } }
      : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          isActive: true,
          createdAt: true,
          subscriptions: {
            where: { status: 'ACTIVE' },
            orderBy: { startedAt: 'desc' },
            take: 1,
            select: { planCode: true, startedAt: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(
      rows.map((u) => ({ ...u, plan: u.subscriptions[0]?.planCode ?? 'FREE' })),
      page,
      limit,
      total,
    );
  }

  async setUserPlan(userId: string, planCode: string | null) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (planCode && !['PREMIUM', 'PRO'].includes(planCode)) {
      throw new BadRequestException('planCode doit être PREMIUM, PRO ou null (retour FREE)');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'CANCELLED', expiresAt: new Date() },
      });
      if (planCode) {
        await tx.subscription.create({
          data: {
            userId,
            planCode,
            status: 'ACTIVE',
            startedAt: new Date(),
            paymentRef: 'admin-grant',
          },
        });
      }
      await tx.auditLog.create({
        data: {
          action: 'user.set_plan',
          entityType: 'user',
          entityId: userId,
          after: { planCode: planCode ?? 'FREE' },
        },
      });
    });
    await this.purgeCaches(userId);
    return { userId, plan: planCode ?? 'FREE' };
  }

  // ---------- Jobs ----------

  async listJobs(page: number, limit: number) {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.jobRun.findMany({
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.jobRun.count(),
    ]);
    return paginated(rows, page, limit, total);
  }

  // ---------- Types de tirage ----------

  async updateDrawType(code: string, patch: { isActive?: boolean; scheduledTime?: string | null }) {
    const game = await this.prisma.game.findUnique({ where: { code: 'loto-bonheur' } });
    if (!game) throw new NotFoundException('Jeu non configuré');
    const drawType = await this.prisma.drawType.findUnique({
      where: { gameId_code: { gameId: game.id, code } },
    });
    if (!drawType) throw new NotFoundException(`Type de tirage inconnu : ${code}`);
    const updated = await this.prisma.drawType.update({
      where: { id: drawType.id },
      data: {
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        ...(patch.scheduledTime !== undefined
          ? {
              scheduledTime: patch.scheduledTime
                ? new Date(`1970-01-01T${patch.scheduledTime}:00Z`)
                : null,
            }
          : {}),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        action: 'draw_type.update',
        entityType: 'draw_type',
        entityId: drawType.id,
        before: { isActive: drawType.isActive, scheduledTime: drawType.scheduledTime },
        after: JSON.parse(JSON.stringify(patch)),
      },
    });
    return updated;
  }

  /** Les stratégies/plans influencent gating et réponses cachées. */
  private async purgeCaches(userId?: string): Promise<void> {
    try {
      const keys: string[] = [];
      let cursor = '0';
      do {
        const [next, found] = await this.redis.client.scan(
          cursor,
          'MATCH',
          'cache:*',
          'COUNT',
          200,
        );
        cursor = next;
        keys.push(...found);
      } while (cursor !== '0');
      if (userId) keys.push(`entitlements:${userId}`);
      if (keys.length) await this.redis.client.del(...keys);
    } catch {
      /* best-effort */
    }
  }
}
