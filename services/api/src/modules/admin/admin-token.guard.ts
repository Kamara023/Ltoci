import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

/**
 * Garde d'amorçage du backoffice (PHASE 2) : header `X-Admin-Token` comparé
 * au secret ADMIN_BOOTSTRAP_TOKEN. Sera REMPLACÉ par l'authentification
 * JWT + RBAC complète en PHASE 5 — ne pas étendre son usage au-delà
 * des routes /admin.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const provided = String(request.headers['x-admin-token'] ?? '');
    const expected = this.config.getOrThrow<string>('ADMIN_BOOTSTRAP_TOKEN');
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Token administrateur manquant ou invalide');
    }
    return true;
  }
}
