import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateDrawNumbersDto } from './dto/quality.dto';

/**
 * Workflow de revue qualité (PHASE 3).
 * Règles :
 *  - une décision manuelle (validate/invalidate) prime sur le moteur et
 *    n'est jamais écrasée par lui (validated_by non nul) ;
 *  - toute mutation est auditée (ops.audit_logs) ;
 *  - après résolution/correction, un re-contrôle du tirage est demandé au
 *    service ingestion en best-effort (son indisponibilité ne bloque pas).
 */
@Injectable()
export class AdminQualityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ---------- Issues ----------

  async listIssues(
    page: number,
    limit: number,
    filters: { resolved?: boolean; ruleCode?: string; severity?: string },
  ) {
    const where = {
      ...(filters.resolved === undefined
        ? {}
        : filters.resolved
          ? { resolvedAt: { not: null } }
          : { resolvedAt: null }),
      ...(filters.ruleCode ? { ruleCode: filters.ruleCode } : {}),
      ...(filters.severity ? { severity: filters.severity } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.dataQualityIssue.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          draw: {
            select: {
              id: true,
              drawDate: true,
              status: true,
              drawType: { select: { code: true, name: true } },
            },
          },
        },
      }),
      this.prisma.dataQualityIssue.count({ where }),
    ]);
    return { data, meta: { page, limit, total } };
  }

  async resolveIssue(issueId: string, note: string) {
    const issue = await this.prisma.dataQualityIssue.findUnique({ where: { id: issueId } });
    if (!issue) throw new NotFoundException(`Issue inconnue : ${issueId}`);
    if (issue.resolvedAt) throw new BadRequestException('Issue déjà résolue');

    const admin = await this.systemAdminId();
    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.dataQualityIssue.update({
        where: { id: issueId },
        data: {
          resolvedAt: new Date(),
          resolvedBy: admin,
          details: { ...(issue.details as object), resolution_note: note },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: admin,
          action: 'quality.issue_resolve',
          entityType: 'data_quality_issue',
          entityId: issueId,
          before: { resolvedAt: null },
          after: { note },
        },
      });
      return res;
    });
    const rerun = issue.drawId ? await this.rerunQuality(`draw:${issue.drawId}`) : null;
    return { issue: updated, qualityRerun: rerun };
  }

  // ---------- Décisions manuelles sur un tirage ----------

  async validateDraw(drawId: string) {
    return this.decide(drawId, 'VALID', 'Validation manuelle administrateur');
  }

  async invalidateDraw(drawId: string, reason: string) {
    return this.decide(drawId, 'INVALID', reason);
  }

  private async decide(drawId: string, status: 'VALID' | 'INVALID', note: string) {
    const draw = await this.prisma.draw.findUnique({ where: { id: drawId } });
    if (!draw) throw new NotFoundException(`Tirage inconnu : ${drawId}`);
    const admin = await this.systemAdminId();

    return this.prisma.$transaction(async (tx) => {
      await tx.dataQualityIssue.updateMany({
        where: { drawId, resolvedAt: null },
        data: { resolvedAt: new Date(), resolvedBy: admin },
      });
      const updated = await tx.draw.update({
        where: { id: drawId },
        data: { status, validatedAt: new Date(), validatedById: admin },
      });
      await tx.auditLog.create({
        data: {
          userId: admin,
          action: status === 'VALID' ? 'draw.validate' : 'draw.invalidate',
          entityType: 'draw',
          entityId: drawId,
          before: { status: draw.status },
          after: { status, note },
        },
      });
      return updated;
    });
  }

  // ---------- Correction des numéros ----------

  async updateDrawNumbers(drawId: string, dto: UpdateDrawNumbersDto) {
    if (!dto.winningNumbers && !dto.machineNumbers) {
      throw new BadRequestException('Fournir winningNumbers et/ou machineNumbers');
    }
    const draw = await this.prisma.draw.findUnique({
      where: { id: drawId },
      include: { numberSets: { include: { setType: true } } },
    });
    if (!draw) throw new NotFoundException(`Tirage inconnu : ${drawId}`);

    const setTypes = await this.prisma.gameNumberSetType.findMany({
      where: { gameId: draw.gameId },
    });
    const byCode = Object.fromEntries(setTypes.map((s) => [s.code, s.id]));
    const admin = await this.systemAdminId();
    const before = Object.fromEntries(
      draw.numberSets.map((s) => [s.setType.code, s.numbers]),
    );

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        for (const [code, numbers] of [
          ['WINNING', dto.winningNumbers],
          ['MACHINE', dto.machineNumbers],
        ] as const) {
          if (!numbers) continue;
          if (!byCode[code]) throw new BadRequestException(`Ensemble ${code} non configuré`);
          await tx.drawNumberSet.deleteMany({ where: { drawId, setTypeId: byCode[code] } });
          await tx.drawNumberSet.create({
            data: { drawId, setTypeId: byCode[code], numbers },
          });
        }
        const res = await tx.draw.update({
          where: { id: drawId },
          data: { status: 'PENDING_REVIEW', validatedAt: null, validatedById: null },
          include: { numberSets: true },
        });
        await tx.auditLog.create({
          data: {
            userId: admin,
            action: 'draw.correct_numbers',
            entityType: 'draw',
            entityId: drawId,
            before,
            after: {
              winning: dto.winningNumbers ?? before['WINNING'],
              machine: dto.machineNumbers ?? before['MACHINE'],
              reason: dto.reason,
            },
          },
        });
        return res;
      });
      const rerun = await this.rerunQuality(`draw:${drawId}`);
      const refreshed = await this.prisma.draw.findUnique({
        where: { id: drawId },
        include: { numberSets: true },
      });
      return { draw: refreshed ?? updated, qualityRerun: rerun };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const known = ['BAD_CARDINALITY', 'OUT_OF_RANGE', 'DUP_IN_SET'];
      const hit = known.find((k) => message.includes(k));
      if (hit) {
        const detail = message.split('\n').find((l) => l.includes(hit)) ?? hit;
        throw new BadRequestException(`Numéros invalides — ${detail.trim()}`);
      }
      throw err;
    }
  }

  // ---------- Pilotage ----------

  async summary() {
    const [byStatus, openByRule, totalIssues] = await Promise.all([
      this.prisma.draw.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.dataQualityIssue.groupBy({
        by: ['ruleCode'],
        where: { resolvedAt: null },
        _count: { _all: true },
      }),
      this.prisma.dataQualityIssue.count(),
    ]);
    return {
      draws: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      openIssuesByRule: Object.fromEntries(openByRule.map((r) => [r.ruleCode, r._count._all])),
      totalIssues,
    };
  }

  async runQuality(scope: 'pending' | 'all') {
    const result = await this.rerunQuality(scope);
    if (result && result.startsWith('failed')) {
      throw new BadGatewayException(`Service ingestion : ${result}`);
    }
    return { status: 'ACCEPTED', scope, detail: result };
  }

  // ---------- Helpers ----------

  private async systemAdminId(): Promise<string | null> {
    const admin = await this.prisma.user.findFirst({ where: { role: 'SUPERADMIN' } });
    return admin?.id ?? null;
  }

  /** Re-contrôle qualité best-effort via le service ingestion. */
  private async rerunQuality(scope: string): Promise<string> {
    try {
      const response = await fetch(
        `${this.config.getOrThrow<string>('INGESTION_SERVICE_URL')}/internal/quality/run`,
        {
          method: 'POST',
          headers: {
            'X-Internal-Token': this.config.getOrThrow<string>('INGESTION_SERVICE_TOKEN'),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ scope, triggered_by: 'admin' }),
        },
      );
      if (!response.ok) return `failed: HTTP ${response.status}`;
      const body = (await response.json()) as { status?: string };
      return body.status ?? 'ok';
    } catch (err) {
      return `failed: ${(err as Error).message}`;
    }
  }
}
