import Link from 'next/link';
import { STR } from '@/lib/strings';

/** Présentation propre d'une fonctionnalité hors plan (403 de l'API). */
export function UpsellCard({ message }: { message?: string }) {
  return (
    <div className="rounded-lg border border-accent/40 bg-accent-soft p-6 text-center">
      <p className="text-lg font-semibold">{STR.upsell.title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">{message ?? STR.upsell.body}</p>
      <Link
        href="/inscription"
        className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white"
      >
        {STR.upsell.cta}
      </Link>
    </div>
  );
}
