import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { HttpErrorFilter } from '../src/common/http-exception.filter';
import { requestIdMiddleware } from '../src/common/request-id.middleware';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Combinaisons candidates : catalogue, gating par plan, détail décomposé.
 * Tolérant à l'absence de générations (base CI vierge).
 */
describe('Predictions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let premiumToken: string;
  const email = `e2e-pred-${randomUUID().slice(0, 8)}@test.local`;

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

  it('catalogue public des stratégies avec descriptions honnêtes et disclaimer', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/strategies').expect(200);
    const codes = res.body.data.map((s: { code: string }) => s.code);
    expect(codes).toContain('STRATEGY_RANDOM');
    expect(codes).toContain('STRATEGY_FREQUENCY');
    expect(res.body.disclaimer).toContain('aléatoires');
    const random = res.body.data.find((s: { code: string }) => s.code === 'STRATEGY_RANDOM');
    expect(random.description).toContain('backtesting');
  });

  it('anonyme : liste limitée à la stratégie FREQUENCY (plan FREE)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/predictions').expect(200);
    for (const p of res.body.data) {
      expect(p.strategy.code).toBe('STRATEGY_FREQUENCY');
    }
    expect(res.body.disclaimer).toBeDefined();
  });

  it('anonyme : stratégie hors plan → 403 STRATEGY_NOT_ALLOWED', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/predictions?strategy=STRATEGY_STATISTICAL')
      .expect(403);
    expect(res.body.error.code).toBe('STRATEGY_NOT_ALLOWED');
  });

  it('PREMIUM : accès aux stratégies avancées + détail complet', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/predictions')
      .set('Authorization', `Bearer ${premiumToken}`)
      .expect(200);

    if (list.body.data.length === 0) return; // base CI vierge : rien à détailler

    const statistical = list.body.data.find(
      (p: { strategy: { code: string } }) => p.strategy.code === 'STRATEGY_STATISTICAL',
    );
    expect(statistical).toBeDefined();

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/predictions/${statistical.id}`)
      .set('Authorization', `Bearer ${premiumToken}`)
      .expect(200);
    expect(detail.body.combinations).toHaveLength(10);
    const first = detail.body.combinations[0];
    expect(first.numbers).toHaveLength(5);
    expect(first.breakdown.components).toBeDefined();
    expect(first.explanation).toContain('indépendant');
    expect(detail.body.disclaimer).toBeDefined();
    expect(detail.body.datasetCutoffDrawId).toBeTruthy();

    // Le même détail en anonyme → 403 (stratégie hors plan FREE)
    await request(app.getHttpServer())
      .get(`/api/v1/predictions/${statistical.id}`)
      .expect(403);
  });
});
