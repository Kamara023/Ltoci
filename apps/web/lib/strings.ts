/**
 * Chaînes de l'interface — centralisées pour faciliter une i18n future.
 * Le français est la langue du MVP (décision PHASE 6).
 */
export const STR = {
  appName: 'LotoStats CI',
  tagline: 'Les données du Loto Bonheur, analysées sérieusement.',
  disclaimerTitle: 'Analyse statistique, pas prédiction',
  responsibleGaming:
    'Le jeu comporte des risques : endettement, isolement, dépendance. Jouez de manière responsable. ' +
    'LotoStats CI est un service d’analyse statistique indépendant, non affilié à la LONACI.',
  nav: {
    home: 'Accueil',
    results: 'Résultats',
    statistics: 'Statistiques',
    methodology: 'Méthodologie',
    login: 'Connexion',
    account: 'Mon compte',
  },
  windows: {
    ALL: 'Tout l’historique',
    LAST_100: '100 derniers',
    LAST_50: '50 derniers',
    LAST_20: '20 derniers',
    LAST_10: '10 derniers',
  } as Record<string, string>,
  sets: { WINNING: 'Numéros gagnants', MACHINE: 'Numéros machine' } as Record<string, string>,
  dataUnavailable: 'Données momentanément indisponibles — réessayez dans un instant.',
  upsell: {
    title: 'Fonctionnalité Premium',
    body: 'Cette analyse (retards, paires, tendances, fenêtres longues) fait partie du plan PREMIUM. Créez un compte pour découvrir les statistiques avancées.',
    cta: 'Créer un compte',
  },
};
