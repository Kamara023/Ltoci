import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Test e2e du health check — nécessite PostgreSQL et Redis démarrés
 * (docker compose -f infrastructure/docker/docker-compose.dev.yml up -d).
 */
describe('GET /api/v1/health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('répond ok avec la base et Redis joignables', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('up');
    expect(res.body.redis).toBe('up');
    expect(res.body.version).toBeDefined();
  });
});
