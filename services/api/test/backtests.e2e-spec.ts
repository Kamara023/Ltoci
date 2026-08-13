import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { HttpErrorFilter } from '../src/common/http-exception.filter';
import { requestIdMiddleware } from '../src/common/request-id.middleware';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/** Backtests : gating PREMIUM (lecture) / PRO (relance), métriques complètes. */
describe('Backtests (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let premiumToken: string;
  const email = `e2e-bt-${randomUUID().slice(0, 8)}@test.local`;

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

  it('anonyme → 403 ENTITLEMENT_REQUIRED', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/backtests').expect(403);
    expect(res.body.error.code).toBe('ENTITLEMENT_REQUIRED');
  });

  it('PREMIUM : comparatif avec méthode et disclaimer', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/backtests')
      .set('Authorization', `Bearer ${premiumToken}`)
      .expect(200);
    expect(res.body.method).toContain('Walk-forward');
    expect(res.body.disclaimer).toBeDefined();
    if (res.body.data.length === 0) return; // base CI vierge

    const random = res.body.data.find(
      (b: { strategy: { code: string } }) => b.strategy.code === 'STRATEGY_RANDOM',
    );
    expect(random).toBeDefined();
    expect(random.avgMatches).toBeGreaterThan(0.24);
    expect(random.avgMatches).toBeLessThan(0.32);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/backtests/${res.body.data[0].id}`)
      .set('Authorization', `Bearer ${premiumToken}`)
      .expect(200);
    expect(detail.body.metrics.match_distribution).toBeDefined();
    expect(detail.body.metrics.by_year).toBeDefined();
  });

  it('PREMIUM ne peut pas relancer (PRO requis) → 403', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/backtests/run')
      .set('Authorization', `Bearer ${premiumToken}`)
      .expect(403);
  });
});
