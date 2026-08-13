import type { Metadata } from 'next';
import './globals.css';
import { AdminShell } from '@/components/AdminShell';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'LotoStats Admin', template: '%s · LotoStats Admin' },
  description: 'Backoffice d’administration LotoStats CI.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen antialiased">
        <Providers>
          <AdminShell>{children}</AdminShell>
        </Providers>
      </body>
    </html>
  );
}
