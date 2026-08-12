import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Tests e2e du workflow de revue qualité — PostgreSQL + Redis requis.
 * Le re-contrôle via le service ingestion est best-effort : les assertions
 * restent valides que le service soit démarré ou non.
 */
describe('Admin quality (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let drawId: string;
  const token = process.env.ADMIN_BOOTSTRAP_TOKEN ?? 'dev-admin-token-a-changer';
  // Date passée antérieure au début des données collectées (oct. 2020) :
  // aucun risque de collision avec un tirage réel.
  const TEST_DATE = '2020-03-01';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/draws')
      .set('X-Admin-Token', token)
      .send({ drawTypeCode: 'reveil', drawDate: TEST_DATE, winningNumbers: [11, 22, 33, 44, 55] })
      .expect(201);
    drawId = res.body.id;
  });

  afterAll(async () => {
    await prisma.draw.deleteMany({ where: { drawDate: new Date(TEST_DATE) } });
    await prisma.auditLog.deleteMany({
      where: { entityId: drawId ?? '00000000-0000-0000-0000-000000000000' },
    });
    await app.close();
  });

  it('résumé qualité : répartition des statuts et issues ouvertes', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/quality/summary')
      .set('X-Admin-Token', token)
      .expect(200);
    expect(res.body.draws).toBeDefined();
    expect(res.body.openIssuesByRule).toBeDefined();
  });

  it('liste paginée des issues avec filtres', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/quality/issues?resolved=false&limit=5')
      .set('X-Admin-Token', token)
      .expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta.limit).toBe(5);
  });

  it('invalidation manuelle : motif obligatoire, statut forcé, audit', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/admin/draws/${drawId}/invalidate`)
      .set('X-Admin-Token', token)
      .send({})
      .expect(400); // reason manquant

    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/draws/${drawId}/invalidate`)
      .set('X-Admin-Token', token)
      .send({ reason: 'Test e2e : données douteuses' })
      .expect(201);
    expect(res.body.status).toBe('INVALID');
    expect(res.body.validatedById).toBeTruthy(); // décision manuelle tracée

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'draw.invalidate', entityId: drawId },
    });
    expect(audit).not.toBeNull();
  });

  it('validation manuelle : statut VALID, prime sur le moteur', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/draws/${drawId}/validate`)
      .set('X-Admin-Token', token)
      .expect(201);
    expect(res.body.status).toBe('VALID');
  });

  it('correction des numéros : trigger revalide, retour en revue, audit before/after', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/draws/${drawId}/numbers`)
      .set('X-Admin-Token', token)
      .send({ winningNumbers: [1, 2, 3, 4, 95], reason: 'test' })
      .expect(400); // hors plage -> rejeté par le trigger

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/draws/${drawId}/numbers`)
      .set('X-Admin-Token', token)
      .send({ winningNumbers: [89, 4, 58, 17, 33], reason: 'Correction test e2e' })
      .expect(200);

    const winning = res.body.draw.numberSets.find(
      (s: { numbers: number[] }) => s.numbers.length === 5,
    );
    expect(winning.numbers).toEqual([4, 17, 33, 58, 89]); // trié par le trigger
    // Sans re-contrôle (ingestion absente) : PENDING_REVIEW ; avec : VALID
    // (MISSING_SET ancien auto-résolu). Les deux sont corrects.
    expect(['PENDING_REVIEW', 'VALID']).toContain(res.body.draw.status);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'draw.correct_numbers', entityId: drawId },
    });
    expect(audit?.before).toBeDefined();
    expect(audit?.after).toBeDefined();
  });

  it('résolution d’une issue inexistante -> 404', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/quality/issues/00000000-0000-0000-0000-000000000000/resolve')
      .set('X-Admin-Token', token)
      .send({ note: 'x' })
      .expect(404);
  });
});
