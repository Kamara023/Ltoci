/**
 * Seed initial LotoStats — idempotent (upserts par clés naturelles).
 * Référentiel : jeu Loto Bonheur, ensembles de numéros, types de tirage
 * (PROVISOIRES — confirmés en PHASE 2 avec la source), sources, fenêtres
 * d'analyse, plans SaaS, stratégies, compte SUPERADMIN (depuis .env).
 *
 * Aucune donnée de tirage n'est seedée : les résultats historiques
 * proviennent exclusivement de l'ingestion (jamais inventés).
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function seedGame(): Promise<string> {
  const game = await prisma.game.upsert({
    where: { code: 'loto-bonheur' },
    update: {},
    create: {
      code: 'loto-bonheur',
      name: 'Loto Bonheur',
      operator: 'LONACI',
      countryCode: 'CI',
      metadata: {
        description:
          "Loto Bonheur de la LONACI — 5 numéros parmi 1 à 90, deux ensembles publiés par tirage (numéros gagnants et numéros machine), plusieurs tirages nommés par jour.",
      },
    },
  });

  for (const [code, label, order] of [
    ['WINNING', 'Numéros gagnants', 0],
    ['MACHINE', 'Numéros machine', 1],
  ] as const) {
    await prisma.gameNumberSetType.upsert({
      where: { gameId_code: { gameId: game.id, code } },
      update: {},
      create: {
        gameId: game.id,
        code,
        label,
        numbersCount: 5,
        numberMin: 1,
        numberMax: 90,
        displayOrder: order,
      },
    });
  }

  // Types de tirage : depuis la PHASE 2, le référentiel est piloté par les
  // DONNÉES — le collecteur lonaci-api crée automatiquement les types réels
  // (39 constatés) lors de l'ingestion. Un seul type est seedé pour que la
  // saisie manuelle et les tests e2e fonctionnent sur une base vierge.
  await prisma.drawType.upsert({
    where: { gameId_code: { gameId: game.id, code: 'reveil' } },
    update: {},
    create: {
      gameId: game.id,
      code: 'reveil',
      name: 'Reveil',
      scheduledTime: new Date('1970-01-01T10:00:00Z'),
      daysOfWeek: [],
      metadata: { source: 'seed' },
    },
  });
  return game.id;
}

async function seedDataSources(): Promise<void> {
  const sources = [
    { code: 'manual-admin', kind: 'MANUAL', label: 'Saisie manuelle (backoffice)', priority: 10 },
    { code: 'csv-import', kind: 'CSV', label: 'Import de fichiers CSV', priority: 50 },
    { code: 'excel-import', kind: 'EXCEL', label: 'Import de fichiers Excel', priority: 50 },
    { code: 'json-import', kind: 'JSON', label: 'Import de fichiers JSON', priority: 50 },
    {
      code: 'lonaci-api',
      kind: 'SCRAPER',
      label: 'Collecteur lotobonheur.ci (API JSON publique)',
      priority: 100,
      baseUrl: 'https://lotobonheur.ci',
    },
  ] as const;
  for (const s of sources) {
    await prisma.dataSource.upsert({
      where: { code: s.code },
      update: {},
      create: {
        code: s.code,
        kind: s.kind,
        label: s.label,
        priority: s.priority,
        baseUrl: 'baseUrl' in s ? s.baseUrl : null,
      },
    });
  }
}

async function seedAnalysisWindows(): Promise<void> {
  for (const code of ['ALL', 'LAST_100', 'LAST_50', 'LAST_20', 'LAST_10']) {
    await prisma.analysisWindow.upsert({ where: { code }, update: {}, create: { code } });
  }
}

async function seedPlans(): Promise<void> {
  const plans = [
    {
      code: 'FREE',
      name: 'Gratuit',
      priceMonthlyXof: 0,
      entitlements: {
        history_days: 30,
        windows: ['LAST_10', 'LAST_20'],
        strategies: ['STRATEGY_FREQUENCY'],
        advanced_stats: false,
        backtesting: false,
        backtesting_run: false,
        ai_analyst: false,
        notifications: false,
        api_access: false,
        exports: false,
        rate_limit_per_min: 30,
      },
    },
    {
      code: 'PREMIUM',
      name: 'Premium',
      priceMonthlyXof: 2500,
      entitlements: {
        history_days: null,
        windows: ['ALL', 'LAST_100', 'LAST_50', 'LAST_20', 'LAST_10', 'CUSTOM'],
        strategies: [
          'STRATEGY_RANDOM',
          'STRATEGY_FREQUENCY',
          'STRATEGY_HOT_NUMBERS',
          'STRATEGY_COLD_NUMBERS',
          'STRATEGY_RECENCY',
          'STRATEGY_BALANCED',
          'STRATEGY_COOCCURRENCE',
          'STRATEGY_STATISTICAL',
          'STRATEGY_MONTE_CARLO',
        ],
        advanced_stats: true,
        backtesting: true,
        backtesting_run: false,
        ai_analyst: true,
        notifications: true,
        api_access: false,
        exports: false,
        rate_limit_per_min: 120,
      },
    },
    {
      code: 'PRO',
      name: 'Pro',
      priceMonthlyXof: 10000,
      entitlements: {
        history_days: null,
        windows: ['ALL', 'LAST_100', 'LAST_50', 'LAST_20', 'LAST_10', 'CUSTOM'],
        strategies: ['*'],
        advanced_stats: true,
        backtesting: true,
        backtesting_run: true,
        ai_analyst: true,
        notifications: true,
        api_access: true,
        exports: true,
        rate_limit_per_min: 600,
      },
    },
  ];
  for (const p of plans) {
    await prisma.plan.upsert({
      where: { code: p.code },
      update: { entitlements: p.entitlements, name: p.name, priceMonthlyXof: p.priceMonthlyXof },
      create: p,
    });
  }
}

async function seedStrategies(): Promise<void> {
  // Seules RANDOM (baseline obligatoire) et FREQUENCY sont actives au départ ;
  // les autres seront activées au fil des phases 7 à 9.
  const strategies: Array<{
    code: string;
    name: string;
    description: string;
    isEnabled: boolean;
    minPlan: string;
    defaultConfig?: Record<string, unknown>;
  }> = [
    {
      code: 'STRATEGY_RANDOM',
      name: 'Aléatoire (baseline)',
      description:
        'Sélection uniforme de combinaisons. Sert de référence obligatoire : toute autre stratégie est comparée à celle-ci par backtesting.',
      isEnabled: true,
      minPlan: 'FREE',
    },
    {
      code: 'STRATEGY_FREQUENCY',
      name: 'Fréquence historique',
      description:
        'Privilégie les numéros les plus fréquents sur la fenêtre choisie. Indicateur descriptif : ne modifie pas les probabilités réelles.',
      isEnabled: true,
      minPlan: 'FREE',
      defaultConfig: { window: 'ALL' },
    },
    {
      code: 'STRATEGY_HOT_NUMBERS',
      name: 'Numéros chauds',
      description: 'Fréquence sur fenêtre courte. Descriptif, non prédictif.',
      isEnabled: false,
      minPlan: 'PREMIUM',
      defaultConfig: { window: 'LAST_20' },
    },
    {
      code: 'STRATEGY_COLD_NUMBERS',
      name: 'Numéros froids',
      description:
        "Numéros les moins fréquents. Documenté comme non prédictif : un numéro « en retard » n'est pas « dû » (sophisme du joueur).",
      isEnabled: false,
      minPlan: 'PREMIUM',
      defaultConfig: { window: 'LAST_50' },
    },
    {
      code: 'STRATEGY_RECENCY',
      name: 'Récence pondérée',
      description: 'Fréquence pondérée par décroissance exponentielle.',
      isEnabled: false,
      minPlan: 'PREMIUM',
      defaultConfig: { lambda: 0.05 },
    },
    {
      code: 'STRATEGY_BALANCED',
      name: 'Équilibrée',
      description: 'Contraintes de forme : pair/impair, haut/bas, somme dans la plage historique centrale.',
      isEnabled: false,
      minPlan: 'PREMIUM',
    },
    {
      code: 'STRATEGY_COOCCURRENCE',
      name: 'Cooccurrences',
      description: 'Score basé sur le lift des paires fréquentes.',
      isEnabled: false,
      minPlan: 'PREMIUM',
    },
    {
      code: 'STRATEGY_STATISTICAL',
      name: 'Score composite',
      description: 'Combinaison pondérée fréquence + retard + cooccurrence.',
      isEnabled: false,
      minPlan: 'PREMIUM',
      defaultConfig: {
        weights: {
          frequency: 1.0,
          recency: 1.0,
          cooccurrence: 0.5,
          odd_even_balance: 0.5,
          high_low_balance: 0.5,
          dispersion: 0.5,
          diversity: 0.5,
        },
      },
    },
    {
      code: 'STRATEGY_MONTE_CARLO',
      name: 'Monte Carlo',
      description: 'Simulation massive filtrée par contraintes statistiques.',
      isEnabled: false,
      minPlan: 'PREMIUM',
      defaultConfig: { pool_size: 50000 },
    },
    {
      code: 'STRATEGY_ML_RF',
      name: 'Random Forest (expérimental)',
      description:
        'Modèle expérimental et pédagogique. Attendu scientifique : ne bat pas durablement la baseline aléatoire sur un tirage équitable.',
      isEnabled: false,
      minPlan: 'PRO',
    },
    {
      code: 'STRATEGY_ML_GB',
      name: 'Gradient Boosting (expérimental)',
      description: 'Modèle expérimental, comparé à la baseline aléatoire.',
      isEnabled: false,
      minPlan: 'PRO',
    },
    {
      code: 'STRATEGY_ENSEMBLE',
      name: 'Ensemble',
      description: 'Agrégation pondérée des scores des stratégies actives.',
      isEnabled: false,
      minPlan: 'PRO',
    },
  ];
  for (const s of strategies) {
    await prisma.strategy.upsert({
      where: { code: s.code },
      update: { description: s.description, minPlan: s.minPlan },
      create: {
        code: s.code,
        name: s.name,
        description: s.description,
        isEnabled: s.isEnabled,
        minPlan: s.minPlan,
        defaultConfig: (s.defaultConfig ?? {}) as object,
      },
    });
  }
}

async function seedAdmin(): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? '').toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD ?? '';
  if (!email || !password) {
    console.warn('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD absents — aucun compte admin créé.');
    return;
  }
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, displayName: 'Administrateur', role: 'SUPERADMIN' },
  });
}

async function main(): Promise<void> {
  await seedGame();
  await seedDataSources();
  await seedAnalysisWindows();
  await seedPlans();
  await seedStrategies();
  await seedAdmin();

  const counts = {
    games: await prisma.game.count(),
    setTypes: await prisma.gameNumberSetType.count(),
    drawTypes: await prisma.drawType.count(),
    sources: await prisma.dataSource.count(),
    windows: await prisma.analysisWindow.count(),
    plans: await prisma.plan.count(),
    strategies: await prisma.strategy.count(),
    users: await prisma.user.count(),
  };
  console.log('Seed terminé :', JSON.stringify(counts));
}

main()
  .catch((err) => {
    console.error('Échec du seed :', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
