'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { getAdminToken, setAdminToken } from '@/lib/adminApi';

const LINKS = [
  { href: '/', label: 'Tableau de bord' },
  { href: '/qualite', label: 'Qualité' },
  { href: '/ingestion', label: 'Ingestion' },
  { href: '/strategies', label: 'Stratégies' },
  { href: '/utilisateurs', label: 'Utilisateurs' },
  { href: '/jobs', label: 'Jobs' },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === '/login';

  useEffect(() => {
    if (!isLogin && !getAdminToken()) router.replace('/login');
  }, [isLogin, pathname, router]);

  if (isLogin) return <main className="mx-auto max-w-md px-4 py-16">{children}</main>;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-surface-2">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="font-bold">
            <span className="text-accent">LotoStats</span> Admin
          </span>
          <nav className="flex flex-wrap gap-4 text-sm">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={
                  pathname === l.href ? 'font-semibold text-accent' : 'text-ink-2 hover:text-ink'
                }
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <button
            onClick={() => {
              setAdminToken(null);
              router.push('/login');
            }}
            className="ml-auto text-sm text-ink-3 hover:text-ink"
          >
            Verrouiller
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-border px-4 py-3 text-center text-xs text-ink-3">
        Backoffice interne — toutes les actions sont journalisées (audit_logs).
      </footer>
    </div>
  );
}
