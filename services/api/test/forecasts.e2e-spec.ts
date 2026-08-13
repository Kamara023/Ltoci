import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { HttpErrorFilter } from '../src/common/http-exception.filter';
import { requestIdMiddleware } from '../src/common/request-id.middleware';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Prévisions TOP 5 (PHASE 11) : gating PRO, structure des réponses
 * (TOP 5/TOP 10, confiance, facteurs, figé), historique + performance.
 * Tolérant à l'absence de prévisions (base CI vierge).
 */
describe('Forecasts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let proToken: string;
  const email = `e2e-fcst-${randomUUID().slice(0, 8)}@test.local`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(requestIdMiddleware);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'MotDePasseTest!2026' })
      .expect(201);
    proToken = reg.body.accessToken;
    await prisma.subscription.create({
      data: {
        userId: reg.body.user.id,
        planCode: 'PRO',
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

  it('anonyme : prévisions hors plan FREE → 403 FORECAST_NOT_ALLOWED', async () => {
    for (const path of ['/forecasts/next', '/forecasts/history', '/forecasts/performance']) {
      const res = await request(app.getHttpServer())
        .get(`/api/v1${path}`)
        .expect(403);
      expect(res.body.error.code).toBe('FORECAST_NOT_ALLOWED');
    }
  });

  it('PRO : prochains tirages — TOP 5/TOP 10 figés avec confiance et facteurs', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/forecasts/next')
      .set('Authorization', `Bearer ${proToken}`)
      .expect(200);
    expect(res.body.disclaimer).toContain('aléatoires');

    if (res.body.data.length === 0) return; // base CI vierge

    const targets = new Set(
      res.body.data.map((f: { drawType: { code: string }; targetDate: string }) =>
        `${f.drawType.code}|${f.targetDate}`,
      ),
    );
    expect(targets.size).toBe(res.body.data.length); // une prévision active par cible

    const f = res.body.data[0];
    expect(f.top5).toHaveLength(5);
    expect(f.top10).toHaveLength(10);
    expect(f.lockedAt).toBeTruthy();
    expect(f.datasetCutoffDrawId).toBeTruthy();
    const first = f.top5[0];
    expect(first.rank).toBe(1);
    expect(first.number).toBeGreaterThanOrEqual(1);
    expect(first.number).toBeLessThanOrEqual(90);
    expect(['faible', 'moyenne', 'forte']).toContain(first.confidence);
    expect(first.factors.dominants?.length).toBeGreaterThan(0);
    expect(first.consensusCount).toBeGreaterThanOrEqual(0);
    // Scores décroissants avec le rang (TOP 10).
    const scores = f.top10.map((e: { score: number }) => e.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('PRO : historique évalué — hits + numéros réels sur chaque entrée', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/forecasts/history?limit=10')
      .set('Authorization', `Bearer ${proToken}`)
      .expect(200);
    expect(res.body.disclaimer).toBeDefined();
    for (const f of res.body.data) {
      expect(f.result).toBeDefined();
      expect(f.result.hitsTop5).toBeGreaterThanOrEqual(0);
      expect(f.result.hitsTop5).toBeLessThanOrEqual(5);
      expect(f.result.hitsTop10).toBeGreaterThanOrEqual(f.result.hitsTop5);
      expect(f.result.actualNumbers.length).toBeGreaterThan(0);
    }
  });

  it('PRO : performance — distribution 0→5 et baseline aléatoire affichée', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/forecasts/performance')
      .set('Authorization', `Bearer ${proToken}`)
      .expect(200);
    expect(res.body.randomBaselineTop5).toBeCloseTo(0.2778, 3);
    expect(Object.keys(res.body.hitsTop5Distribution).sort()).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
    expect(res.body.disclaimer).toBeDefined();
    const totalDist = Object.values(res.body.hitsTop5Distribution).reduce(
      (a: number, b) => a + (b as number),
      0,
    );
    expect(totalDist).toBe(res.body.evaluated);
  });
});
