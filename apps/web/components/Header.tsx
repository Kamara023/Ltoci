'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { STR } from '@/lib/strings';

const LINKS = [
  { href: '/', label: STR.nav.home },
  { href: '/resultats', label: STR.nav.results },
  { href: '/statistiques', label: STR.nav.statistics },
  { href: '/previsions', label: 'Prévisions' },
  { href: '/combinaisons', label: 'Combinaisons' },
  { href: '/backtesting', label: 'Backtesting' },
  { href: '/methodologie', label: STR.nav.methodology },
];

export function Header() {
  const pathname = usePathname();
  const { user, ready } = useAuth();
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-bold">
          <span className="text-accent">Loto</span>Stats CI
        </Link>
        <nav className="flex flex-wrap gap-4 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={
                pathname === l.href
                  ? 'font-semibold text-accent'
                  : 'text-ink-2 hover:text-ink'
              }
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto text-sm">
          {ready && user ? (
            <Link href="/compte" className="text-ink-2 hover:text-ink">
              {user.displayName ?? user.email}
            </Link>
          ) : (
            <Link
              href="/connexion"
              className="rounded-md border border-accent px-3 py-1.5 font-semibold text-accent hover:bg-accent-soft"
            >
              {STR.nav.login}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
