import { describe, expect, it } from 'vitest';
import { AdminApiError, getAdminToken, setAdminToken } from '@/lib/adminApi';

describe('adminApi', () => {
  it('stocke et supprime le token', () => {
    setAdminToken('token-test');
    expect(getAdminToken()).toBe('token-test');
    setAdminToken(null);
    expect(getAdminToken()).toBeNull();
  });

  it('AdminApiError porte statut, code et message', () => {
    const err = new AdminApiError(403, 'FORBIDDEN', 'Accès refusé');
    expect(err.status).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toBe('Accès refusé');
  });
});
