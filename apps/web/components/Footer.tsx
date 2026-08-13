import Link from 'next/link';
import { STR } from '@/lib/strings';

/** Pied de page — avertissement jeu responsable PERMANENT (invariant produit). */
export function Footer() {
  return (
    <footer className="mt-12 border-t border-border bg-surface-2">
      <div className="mx-auto max-w-5xl space-y-3 px-4 py-6 text-xs text-ink-2">
        <p>{STR.responsibleGaming}</p>
        <p>
          Les statistiques affichées sont descriptives et calculées sur les tirages officiels
          publiés. Aucun score n’est une probabilité de gain —{' '}
          <Link href="/methodologie" className="underline">
            lire la méthodologie
          </Link>
          .
        </p>
        <p className="text-ink-3">© 2026 LotoStats CI</p>
      </div>
    </footer>
  );
}
