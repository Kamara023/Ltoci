import { randomUUID } from 'crypto';

/**
 * Attribue un identifiant unique à chaque requête — renvoyé au client
 * (X-Request-Id) et injecté dans le format d'erreur unifié pour corréler
 * les tickets support avec les logs.
 */
export function requestIdMiddleware(
  req: { requestId?: string; headers: Record<string, unknown> },
  res: { setHeader: (k: string, v: string) => void },
  next: () => void,
): void {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && incoming.length <= 64 ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
