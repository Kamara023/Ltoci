import { STR } from '@/lib/strings';

const DEFAULT_TEXT =
  'Les tirages de loterie sont aléatoires et indépendants. Ces indicateurs sont descriptifs : ' +
  'ils ne prédisent pas les résultats futurs et ne modifient pas les probabilités de gain.';

/**
 * Bandeau d'avertissement statistique — OBLIGATOIRE sur toute page
 * affichant des statistiques ou des combinaisons (invariant produit).
 */
export function DisclaimerBanner({ text }: { text?: string }) {
  return (
    <aside
      role="note"
      className="rounded-lg border border-warn/40 bg-surface-2 px-4 py-3 text-sm text-ink-2"
    >
      <strong className="mr-1 text-ink">{STR.disclaimerTitle}.</strong>
      {text ?? DEFAULT_TEXT}
    </aside>
  );
}
