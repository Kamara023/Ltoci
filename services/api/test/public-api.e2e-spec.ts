import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { HttpErrorFilter } from '../src/common/http-exception.filter';
import { requestIdMiddleware } from '../src/common/request-id.middleware';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

/**
 * API publique : gating par plan, cache, format d'erreur, rate limiting.
 * Les assertions portent sur la STRUCTURE (la base CI n'a pas de tirages).
 */
describe('API publique (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let premiumToken: string;
  const premiumEmail = `e2e-premium-${randomUUID().slice(0, 8)}@test.local`;
  const password = 'MotDePasseTest!2026';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(requestIdMiddleware);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
    prisma = app.get(PrismaService);

    // Purge du cache pour des assertions MISS/HIT déterministes.
    const redis = app.get(RedisService);
    const keys = await redis.client.keys('cache:*');
    if (keys.length) await redis.client.del(...keys);

    // Compte PREMIUM : subscription ACTIVE créée directement (les paiements
    // arrivent en PHASE 13) — c'est le chemin de test documenté au plan.
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: premiumEmail, password })
      .expect(201);
    premiumToken = reg.body.accessToken;
    await prisma.subscription.create({
      data: {
        userId: reg.body.user.id,
        planCode: 'PREMIUM',
        status: 'ACTIVE',
        startedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await prisma.subscription.deleteMany({
      where: { user: { email: { endsWith: '@test.local' } } },
    });
    await prisma.user.deleteMany({ where: { email: { endsWith: '@test.local' } } });
    await app.close();
  });

  it('tirages du jour et jeux accessibles sans authentification', async () => {
    await request(app.getHttpServer()).get('/api/v1/draws/latest').expect(200);
    const games = await request(app.getHttpServer()).get('/api/v1/games').expect(200);
    expect(games.body.data[0].code).toBe('loto-bonheur');
    expect(games.body.data[0].setTypes.length).toBeGreaterThanOrEqual(2);
  });

  it('cache Redis : MISS puis HIT', async () => {
    const first = await request(app.getHttpServer())
      .get('/api/v1/statistics/frequencies?window=LAST_20')
      .expect(200);
    // premier appel éventuellement déjà caché par un test précédent : tolérant
    const second = await request(app.getHttpServer())
      .get('/api/v1/statistics/frequencies?window=LAST_20')
      .expect(200);
    expect(['HIT', 'MISS']).toContain(first.headers['x-cache']);
    expect(second.headers['x-cache']).toBe('HIT');
  });

  it('fenêtre hors plan (anonyme=FREE) → 403 WINDOW_NOT_ALLOWED', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/statistics/frequencies?window=ALL')
      .expect(403);
    expect(res.body.error.code).toBe('WINDOW_NOT_ALLOWED');
  });

  it('hot inclut le disclaimer statistique non désactivable', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/statistics/hot?window=LAST_20&limit=5')
      .expect(200);
    expect(res.body.disclaimer).toContain('aléatoires et indépendants');
  });

  it('stats avancées anonymes → 403 ENTITLEMENT_REQUIRED', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/statistics/delays?window=LAST_20')
      .expect(403);
    expect(res.body.error.code).toBe('ENTITLEMENT_REQUIRED');
  });

  it('stats avancées avec plan PREMIUM → 200 (delays, pairs, shapes, trends, fenêtre ALL)', async () => {
    for (const path of [
      '/api/v1/statistics/delays?window=ALL',
      '/api/v1/statistics/pairs?window=ALL&limit=5',
      '/api/v1/statistics/shapes?window=ALL',
      '/api/v1/statistics/trends?window=LAST_100',
    ]) {
      const res = await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${premiumToken}`)
        .expect(200);
      expect(res.body.meta).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
    }
  });

  it('format d’erreur unifié avec requestId (404)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/draws/${randomUUID()}`)
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBeTruthy();
    expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
  });

  // EN DERNIER : consomme le quota anonyme de la route /games pour la minute.
  it('rate limiting : 429 + en-têtes X-RateLimit-* au-delà du quota FREE (30/min)', async () => {
    let last: request.Response | null = null;
    for (let i = 0; i < 40; i++) {
      last = await request(app.getHttpServer()).get('/api/v1/games');
      if (last.status === 429) break;
    }
    expect(last?.status).toBe(429);
    expect(last?.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(Number(last?.headers['x-ratelimit-limit'])).toBe(30);
    expect(last?.headers['x-ratelimit-remaining']).toBe('0');
  });
});
