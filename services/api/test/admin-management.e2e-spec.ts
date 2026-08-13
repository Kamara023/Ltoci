import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { HttpErrorFilter } from '../src/common/http-exception.filter';
import { requestIdMiddleware } from '../src/common/request-id.middleware';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/** Gestion backoffice : stratégies, utilisateurs, jobs — tout audité. */
describe('Admin management (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const token = process.env.ADMIN_BOOTSTRAP_TOKEN ?? 'dev-admin-token-a-changer';
  const email = `e2e-mgmt-${randomUUID().slice(0, 8)}@test.local`;
  let userId: string;

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
    userId = reg.body.user.id;
  });

  afterAll(async () => {
    await prisma.subscription.deleteMany({
      where: { user: { email: { endsWith: '@test.local' } } },
    });
    await prisma.user.deleteMany({ where: { email: { endsWith: '@test.local' } } });
    await app.close();
  });

  it('stratégies : liste complète puis PATCH coefficients (audité, réversible)', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/strategies')
      .set('X-Admin-Token', token)
      .expect(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(12);

    const patch = await request(app.getHttpServer())
      .patch('/api/v1/admin/strategies/STRATEGY_FREQUENCY')
      .set('X-Admin-Token', token)
      .send({ defaultConfig: { window: 'ALL', test_marker: true } })
      .expect(200);
    expect(patch.body.defaultConfig.test_marker).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'strategy.update' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();

    // Retour à la config d'origine.
    await request(app.getHttpServer())
      .patch('/api/v1/admin/strategies/STRATEGY_FREQUENCY')
      .set('X-Admin-Token', token)
      .send({ defaultConfig: { window: 'ALL' } })
      .expect(200);
  });

  it('stratégie inconnue → 404 ; minPlan invalide → 400', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/admin/strategies/STRATEGY_INCONNUE')
      .set('X-Admin-Token', token)
      .send({ isEnabled: false })
      .expect(404);
    await request(app.getHttpServer())
      .patch('/api/v1/admin/strategies/STRATEGY_FREQUENCY')
      .set('X-Admin-Token', token)
      .send({ minPlan: 'PLATINE' })
      .expect(400);
  });

  it('utilisateurs : liste avec plan, attribution PRO puis retour FREE', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/v1/admin/users?search=${email}`)
      .set('X-Admin-Token', token)
      .expect(200);
    expect(list.body.data[0].plan).toBe('FREE');

    await request(app.getHttpServer())
      .put(`/api/v1/admin/users/${userId}/subscription`)
      .set('X-Admin-Token', token)
      .send({ planCode: 'PRO' })
      .expect(200);
    const after = await request(app.getHttpServer())
      .get(`/api/v1/admin/users?search=${email}`)
      .set('X-Admin-Token', token)
      .expect(200);
    expect(after.body.data[0].plan).toBe('PRO');

    await request(app.getHttpServer())
      .put(`/api/v1/admin/users/${userId}/subscription`)
      .set('X-Admin-Token', token)
      .send({ planCode: null })
      .expect(200);
    const back = await request(app.getHttpServer())
      .get(`/api/v1/admin/users?search=${email}`)
      .set('X-Admin-Token', token)
      .expect(200);
    expect(back.body.data[0].plan).toBe('FREE');
  });

  it('jobs : historique paginé', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/jobs?limit=5')
      .set('X-Admin-Token', token)
      .expect(200);
    expect(res.body.meta).toBeDefined();
  });

  it('types de tirage : PATCH horaire puis restauration', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/admin/draw-types/reveil')
      .set('X-Admin-Token', token)
      .send({ scheduledTime: '10:30' })
      .expect(200);
    expect(res.body.scheduledTime).toContain('10:30');
    await request(app.getHttpServer())
      .patch('/api/v1/admin/draw-types/reveil')
      .set('X-Admin-Token', token)
      .send({ scheduledTime: '10:00' })
      .expect(200);
  });

  it('sans token → 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/strategies').expect(401);
  });
});
