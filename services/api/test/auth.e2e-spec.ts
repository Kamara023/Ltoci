import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { HttpErrorFilter } from '../src/common/http-exception.filter';
import { requestIdMiddleware } from '../src/common/request-id.middleware';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/** Cycle d'authentification complet — PostgreSQL + Redis requis. */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e-auth-${randomUUID().slice(0, 8)}@test.local`;
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
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: '@test.local' } } });
    await app.close();
  });

  let accessToken: string;
  let refreshToken: string;

  it('register → tokens + profil', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, displayName: 'Testeur E2E' })
      .expect(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('email en doublon → 409 au format unifié', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: email.toUpperCase(), password })
      .expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.requestId).toBeDefined();
  });

  it('login → tokens ; /me accessible', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;

    const me = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body.email).toBe(email);
  });

  it('refresh : rotation — l’ancien token est consommé', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(201);
    const newRefresh = res.body.refreshToken;
    expect(newRefresh).not.toBe(refreshToken);

    // Réutilisation de l'ANCIEN refresh → vol présumé → toutes sessions révoquées
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);
    // ... y compris le token le plus récent
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: newRefresh })
      .expect(401);
  });

  it('verrouillage progressif : 5 échecs → 429', async () => {
    const lockEmail = `e2e-lock-${randomUUID().slice(0, 8)}@test.local`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: lockEmail, password })
      .expect(201);
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: lockEmail, password: 'mauvais-mot-de-passe' })
        .expect(401);
    }
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: lockEmail, password })
      .expect(429);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('logout révoque la session', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: login.body.refreshToken })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });
});
