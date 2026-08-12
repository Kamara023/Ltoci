import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Tests e2e du pilotage des statistiques — tolérants à l'absence du service
 * ML (best-effort par conception).
 */
describe('Admin statistics (e2e)', () => {
  let app: INestApplication;
  const token = process.env.ADMIN_BOOTSTRAP_TOKEN ?? 'dev-admin-token-a-changer';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuse sans token admin (401)', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/statistics/status').expect(401);
  });

  it('expose la fraîcheur des statistiques (ou available=false si ML absent)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/statistics/status')
      .set('X-Admin-Token', token)
      .expect(200);
    expect(typeof res.body.available).toBe('boolean');
    if (res.body.available) {
      expect(res.body.counts.number_stats).toBeGreaterThan(0);
    }
  });

  it('déclenche un refresh (ok=true si ML disponible, sinon ok=false sans erreur)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/statistics/refresh')
      .set('X-Admin-Token', token)
      .expect(201);
    expect(typeof res.body.ok).toBe('boolean');
  });
});
