import { validateEnv } from './env.validation';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/lotostats',
  REDIS_URL: 'redis://localhost:6379',
  ML_SERVICE_TOKEN: 'un-token-suffisant',
  INGESTION_SERVICE_TOKEN: 'un-token-suffisant',
  ADMIN_BOOTSTRAP_TOKEN: 'un-token-admin-suffisant',
  JWT_ACCESS_SECRET: 'secret-access-de-test-16c',
  JWT_REFRESH_SECRET: 'secret-refresh-de-test-16',
};

describe('validateEnv', () => {
  it('accepte une configuration valide et applique les défauts', () => {
    const env = validateEnv({ ...validEnv });
    expect(env.API_PORT).toBe(3001);
    expect(env.ML_SERVICE_URL).toBe('http://localhost:8000');
  });

  it('rejette une configuration sans DATABASE_URL', () => {
    const { DATABASE_URL: _omitted, ...incomplete } = validEnv;
    expect(() => validateEnv(incomplete)).toThrow(/DATABASE_URL/);
  });

  it('rejette une DATABASE_URL non PostgreSQL', () => {
    expect(() => validateEnv({ ...validEnv, DATABASE_URL: 'mysql://x:y@h:3306/db' })).toThrow();
  });

  it('rejette un port invalide', () => {
    expect(() => validateEnv({ ...validEnv, API_PORT: '99999' })).toThrow();
  });
});
