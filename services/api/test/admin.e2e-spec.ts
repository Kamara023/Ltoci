import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Tests e2e du module admin — nécessitent PostgreSQL + Redis démarrés
 * et le seed appliqué (types de tirage, sources).
 */
describe('Admin (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const token = process.env.ADMIN_BOOTSTRAP_TOKEN ?? 'dev-admin-token-a-changer';
  const TEST_DATE = '2031-01-05'; // dates dédiées aux tests, nettoyées en afterAll
  const TEST_DATE_2 = '2031-01-06';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.draw.deleteMany({
      where: { drawDate: { in: [new Date(TEST_DATE), new Date(TEST_DATE_2)] } },
    });
    await prisma.auditLog.deleteMany({ where: { action: 'draw.manual_create' } });
    await app.close();
  });

  it('refuse les requêtes sans token admin (401)', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/ingestion/runs').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/admin/draws')
      .send({ drawTypeCode: 'reveil', drawDate: TEST_DATE, winningNumbers: [1, 2, 3, 4, 5] })
      .expect(401);
  });

  it('crée un tirage par saisie manuelle, ordre préservé, avec audit', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/draws')
      .set('X-Admin-Token', token)
      .send({
        drawTypeCode: 'reveil',
        drawDate: TEST_DATE,
        winningNumbers: [89, 4, 58, 17, 33],
        machineNumbers: [5, 4, 3, 2, 1],
      })
      .expect(201);

    expect(res.body.status).toBe('PENDING_REVIEW');
    const sets = res.body.numberSets.map((s: { numbers: number[] }) => s.numbers);
    // Ordre de saisie PRÉSERVÉ (ordre de sortie — migration preserve_draw_order).
    expect(sets).toContainEqual([89, 4, 58, 17, 33]);
    expect(sets).toContainEqual([5, 4, 3, 2, 1]);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'draw.manual_create', entityId: res.body.id },
    });
    expect(audit).not.toBeNull();
  });

  it('rejette un doublon de clé naturelle (409)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/draws')
      .set('X-Admin-Token', token)
      .send({ drawTypeCode: 'reveil', drawDate: TEST_DATE, winningNumbers: [10, 20, 30, 40, 50] })
      .expect(409);
  });

  it('rejette des numéros hors plage via le trigger SQL (400)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/draws')
      .set('X-Admin-Token', token)
      .send({ drawTypeCode: 'reveil', drawDate: TEST_DATE_2, winningNumbers: [1, 2, 3, 4, 95] })
      .expect(400);
    expect(JSON.stringify(res.body)).toContain('OUT_OF_RANGE');
  });

  it('rejette un type de tirage inconnu (404)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/draws')
      .set('X-Admin-Token', token)
      .send({ drawTypeCode: 'inexistant', drawDate: TEST_DATE, winningNumbers: [1, 2, 3, 4, 5] })
      .expect(404);
  });

  it('liste les runs d’ingestion (paginé)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/ingestion/runs?page=1&limit=5')
      .set('X-Admin-Token', token)
      .expect(200);
    expect(res.body.meta).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
