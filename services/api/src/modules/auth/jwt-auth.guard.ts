import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

async function resolveUser(
  context: ExecutionContext,
  jwt: JwtService,
  config: ConfigService,
): Promise<AuthUser | null> {
  const req = context
    .switchToHttp()
    .getRequest<{ headers: Record<string, string | undefined>; user?: AuthUser }>();
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const payload = await jwt.verifyAsync<{ sub: string; email: string; role: string }>(
      auth.slice(7),
      { secret: config.getOrThrow<string>('JWT_ACCESS_SECRET') },
    );
    const user: AuthUser = { id: payload.sub, email: payload.email, role: payload.role };
    req.user = user;
    return user;
  } catch {
    return null;
  }
}

/** Authentification obligatoire (401 sans token valide). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = await resolveUser(context, this.jwt, this.config);
    if (!user) throw new UnauthorizedException('Token d’accès manquant ou invalide');
    return true;
  }
}

/** Authentification optionnelle : attache req.user si le token est valide,
 * laisse passer sinon (routes publiques dont la réponse dépend du plan). */
@Injectable()
export class OptionalJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await resolveUser(context, this.jwt, this.config);
    return true;
  }
}

/** Injecte l'utilisateur authentifié (ou null) dans le handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser | null => {
    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    return req.user ?? null;
  },
);
