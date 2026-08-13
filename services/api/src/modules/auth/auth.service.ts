import {
  ConflictException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
}

const ACCESS_TTL_S = 15 * 60; // 15 min
const REFRESH_TTL_D = 30; // 30 jours
const MAX_LOGIN_FAILURES = 5;
const LOCKOUT_S = 15 * 60;

/**
 * Authentification : access JWT court + refresh OPAQUE rotatif.
 * - le refresh est stocké HASHÉ (sha256) — un dump de base ne donne aucun token ;
 * - rotation à chaque usage ; un refresh DÉJÀ CONSOMMÉ réutilisé = vol présumé
 *   → révocation immédiate de toutes les sessions de l'utilisateur ;
 * - verrouillage progressif du login (Redis) : 5 échecs → 15 minutes.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async register(email: string, password: string, displayName?: string) {
    const normalized = email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (existing) throw new ConflictException('Un compte existe déjà avec cet email');
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await this.prisma.user.create({
      data: { email: normalized, passwordHash, displayName },
    });
    const tokens = await this.issueTokens(user.id, user.email, user.role);
    return { user: this.publicUser(user), ...tokens };
  }

  async login(email: string, password: string, userAgent?: string, ip?: string) {
    const normalized = email.toLowerCase().trim();
    await this.assertNotLocked(normalized);

    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    const valid =
      user?.isActive && (await argon2.verify(user.passwordHash, password).catch(() => false));
    if (!user || !valid) {
      await this.recordFailure(normalized);
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }
    await this.clearFailures(normalized);
    const tokens = await this.issueTokens(user.id, user.email, user.role, userAgent, ip);
    return { user: this.publicUser(user), ...tokens };
  }

  async refresh(rawToken: string) {
    const tokenHash = this.hash(rawToken);
    const stored = await this.prisma.refreshToken.findFirst({ where: { tokenHash } });
    if (!stored) throw new UnauthorizedException('Refresh token inconnu');

    if (stored.revokedAt) {
      // Réutilisation d'un token déjà consommé : compromission présumée.
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException(
        'Refresh token déjà utilisé — toutes les sessions ont été révoquées par précaution',
      );
    }
    if (stored.expiresAt < new Date()) throw new UnauthorizedException('Refresh token expiré');

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user?.isActive) throw new UnauthorizedException('Compte désactivé');

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(user.id, user.email, user.role, stored.userAgent ?? undefined);
  }

  async logout(rawToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ---------- helpers ----------

  private async issueTokens(
    userId: string,
    email: string,
    role: string,
    userAgent?: string,
    ip?: string,
  ): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, role },
      { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: ACCESS_TTL_S },
    );
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TTL_D);
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: this.hash(refreshToken), expiresAt, userAgent, ip },
    });
    return { accessToken, refreshToken, accessExpiresIn: ACCESS_TTL_S };
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private publicUser(user: { id: string; email: string; displayName: string | null; role: string }) {
    return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
  }

  private async assertNotLocked(email: string): Promise<void> {
    try {
      const count = Number(await this.redis.client.get(`login:fail:${email}`)) || 0;
      if (count >= MAX_LOGIN_FAILURES) {
        throw new HttpException(
          {
            code: 'ACCOUNT_LOCKED',
            message: 'Trop de tentatives — compte verrouillé 15 minutes',
          },
          429,
        );
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      /* Redis en panne : pas de verrouillage, l'authentification reste sûre */
    }
  }

  private async recordFailure(email: string): Promise<void> {
    try {
      const key = `login:fail:${email}`;
      const count = await this.redis.client.incr(key);
      if (count === 1) await this.redis.client.expire(key, LOCKOUT_S);
    } catch {
      /* best-effort */
    }
  }

  private async clearFailures(email: string): Promise<void> {
    try {
      await this.redis.client.del(`login:fail:${email}`);
    } catch {
      /* best-effort */
    }
  }
}
