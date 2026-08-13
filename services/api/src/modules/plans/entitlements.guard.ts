import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SetMetadata } from '@nestjs/common';
import { Entitlements, EntitlementsService } from './entitlements.service';

export const ENTITLEMENTS_KEY = 'required_entitlements';

/** Exige un ou plusieurs entitlements booléens du plan (ex. 'advanced_stats'). */
export const RequireEntitlement = (...keys: (keyof Entitlements)[]) =>
  SetMetadata(ENTITLEMENTS_KEY, keys);

@Injectable()
export class EntitlementsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<(keyof Entitlements)[]>(ENTITLEMENTS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const req = context
      .switchToHttp()
      .getRequest<{ user?: { id: string }; entitlements?: Entitlements }>();
    const ent = await this.entitlements.forUser(req.user?.id ?? null);
    req.entitlements = ent; // mis à disposition des handlers
    const missing = required.filter((key) => !ent[key]);
    if (missing.length) {
      throw new ForbiddenException({
        code: 'ENTITLEMENT_REQUIRED',
        message:
          `Cette fonctionnalité (${missing.join(', ')}) n'est pas incluse dans votre plan. ` +
          'Passez au plan supérieur pour y accéder.',
      });
    }
    return true;
  }
}
