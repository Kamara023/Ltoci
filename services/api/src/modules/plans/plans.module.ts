import { Global, Module } from '@nestjs/common';
import { EntitlementsGuard } from './entitlements.guard';
import { EntitlementsService } from './entitlements.service';

@Global()
@Module({
  providers: [EntitlementsService, EntitlementsGuard],
  exports: [EntitlementsService, EntitlementsGuard],
})
export class PlansModule {}
