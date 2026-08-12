import { Module } from '@nestjs/common';
import { AdminQualityController } from './admin-quality.controller';
import { AdminQualityService } from './admin-quality.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  controllers: [AdminController, AdminQualityController],
  providers: [AdminService, AdminQualityService],
  exports: [AdminService, AdminQualityService],
})
export class AdminModule {}
