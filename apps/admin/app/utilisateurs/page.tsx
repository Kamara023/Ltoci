'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { QueryError } from '@/components/QueryError';
import { adminFetch } from '@/lib/adminApi';

interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  plan: string;
}

export default function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const users = useQuery<{ data: AdminUser[]; meta: { total: number } }>({
    queryKey: ['users', search],
    queryFn: () => adminFetch(`/admin/users?limit=50&search=${encodeURIComponent(search)}`),
  });
  const setPlan = useMutation({
    mutationFn: ({ id, planCode }: { id: string; planCode: string | null }) =>
      adminFetch(`/admin/users/${id}/subscription`, {
        method: 'PUT',
        body: JSON.stringify({ planCode }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Utilisateurs</h1>
      {users.error ? <QueryError error={users.error} onRetry={() => users.refetch()} /> : null}
      <div className="flex items-center gap-3 text-sm">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par email…"
          className="w-72 rounded-md border border-border bg-surface-2 px-3 py-1.5"
        />
        <span className="text-ink-3">{users.data?.meta.total ?? '—'} compte(s)</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase text-ink-3">
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Nom</th>
              <th className="px-3 py-2">Rôle</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Inscrit le</th>
              <th className="px-3 py-2">Attribuer</th>
            </tr>
          </thead>
          <tbody>
            {(users.data?.data ?? []).map((u) => (
              <tr key={u.id} className="border-b border-border/50">
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2 text-ink-2">{u.displayName ?? '—'}</td>
                <td className="px-3 py-2 text-ink-2">{u.role}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-semibold ${
                      u.plan === 'PRO'
                        ? 'bg-accent-soft text-accent'
                        : u.plan === 'PREMIUM'
                          ? 'bg-ok/15 text-ok'
                          : 'bg-surface text-ink-3 border border-border'
                    }`}
                  >
                    {u.plan}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs tabular-nums text-ink-2">
                  {new Date(u.createdAt).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={u.plan}
                    onChange={(e) =>
                      setPlan.mutate({
                        id: u.id,
                        planCode: e.target.value === 'FREE' ? null : e.target.value,
                      })
                    }
                    className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
                  >
                    {['FREE', 'PREMIUM', 'PRO'].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
