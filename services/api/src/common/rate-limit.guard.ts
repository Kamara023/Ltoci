import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EntitlementsService } from '../modules/plans/entitlements.service';
import { RedisService } from '../redis/redis.service';

/**
 * Rate limiting global (fenêtre fixe Redis d'une minute), par identité ET
 * par route : anonyme = IP (limite du plan FREE), connecté = user
 * (entitlements.rate_limit_per_min de son plan). Le token est décodé ici
 * même (le guard global court avant les guards de route).
 * Exclusions : /health (sondes) et /admin (token dédié).
 * En-têtes : X-RateLimit-Limit / -Remaining / -Reset ; 429 au-delà.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<{
      path: string;
      ip?: string;
      headers: Record<string, string | undefined>;
    }>();
    const path: string = req.path ?? '';
    if (path.includes('/health') || path.includes('/admin') || path.includes('/api/docs')) {
      return true;
    }

    let identity = `ip:${req.ip ?? 'unknown'}`;
    let userId: string | null = null;
    const auth = req.headers['authorization'];
    if (auth?.startsWith('Bearer ')) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub: string }>(auth.slice(7), {
          secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        });
        userId = payload.sub;
        identity = `user:${payload.sub}`;
      } catch {
        /* token invalide : traité comme anonyme, l'authentification tranchera */
      }
    }

    const limit = (await this.entitlements.forUser(userId)).rate_limit_per_min;
    const minute = Math.floor(Date.now() / 60000);
    const key = `ratelimit:${identity}:${path}:${minute}`;

    let count: number;
    try {
      count = await this.redis.client.incr(key);
      if (count === 1) await this.redis.client.expire(key, 65);
    } catch {
      return true; // Redis en panne : ne jamais bloquer le trafic
    }

    const res = http.getResponse<{ setHeader: (k: string, v: string | number) => void }>();
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count));
    res.setHeader('X-RateLimit-Reset', (minute + 1) * 60);

    if (count > limit) {
      throw new HttpException(
        {
          code: 'TOO_MANY_REQUESTS',
          message: `Quota dépassé (${limit} requêtes/minute pour votre plan) — réessayez dans un instant`,
        },
        429,
      );
    }
    return true;
  }
}
