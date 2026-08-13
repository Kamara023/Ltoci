import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, of, switchMap, tap } from 'rxjs';
import { EntitlementsService } from '../modules/plans/entitlements.service';
import { RedisService } from '../redis/redis.service';
import { CACHE_TTL_KEY } from './cache.decorator';

export const CACHE_PREFIX = 'cache:';

/**
 * Cache Redis des réponses GET publiques. La clé encode route + query
 * normalisée + PLAN de l'appelant : les contrôles d'accès dépendant du plan
 * s'exécutent sur cache MISS — sans le plan dans la clé, une réponse PREMIUM
 * cachée serait servie à un anonyme. Header X-Cache: HIT | MISS.
 * Invalidation : motif `cache:*` purgé lors d'un refresh des statistiques.
 */
@Injectable()
export class RedisCacheInterceptor implements NestInterceptor {
  constructor(
    private readonly redis: RedisService,
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ttl = this.reflector.get<number>(CACHE_TTL_KEY, context.getHandler());
    const http = context.switchToHttp();
    const req = http.getRequest<{
      method: string;
      path: string;
      query: Record<string, string>;
      user?: { id: string };
    }>();
    if (!ttl || req.method !== 'GET') return next.handle();

    const res = http.getResponse<{ setHeader: (k: string, v: string) => void }>();
    const sortedQuery = Object.keys(req.query ?? {})
      .sort()
      .map((k) => `${k}=${req.query[k]}`)
      .join('&');

    return from(this.entitlements.forUser(req.user?.id ?? null)).pipe(
      switchMap((ent) => this.serve(`${CACHE_PREFIX}${ent.plan}:${req.path}?${sortedQuery}`, res, next, ttl)),
    );
  }

  private serve(
    key: string,
    res: { setHeader: (k: string, v: string) => void },
    next: CallHandler,
    ttl: number,
  ): Observable<unknown> {
    return from(this.safeGet(key)).pipe(
      switchMap((cached) => {
        if (cached !== null) {
          res.setHeader('X-Cache', 'HIT');
          return of(JSON.parse(cached));
        }
        res.setHeader('X-Cache', 'MISS');
        return next.handle().pipe(
          tap((body) => {
            void this.safeSet(key, JSON.stringify(body), ttl);
          }),
        );
      }),
    );
  }

  private async safeGet(key: string): Promise<string | null> {
    try {
      return await this.redis.client.get(key);
    } catch {
      return null; // Redis en panne = pas de cache, jamais d'erreur client
    }
  }

  private async safeSet(key: string, value: string, ttl: number): Promise<void> {
    try {
      await this.redis.client.setex(key, ttl, value);
    } catch {
      /* best-effort */
    }
  }
}
