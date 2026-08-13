import { Module } from '@nestjs/common';
import { AdminManagementController } from './admin-management.controller';
import { AdminManagementService } from './admin-management.service';
import { AdminQualityController } from './admin-quality.controller';
import { AdminQualityService } from './admin-quality.service';
import { AdminStatisticsController } from './admin-statistics.controller';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  controllers: [
    AdminController,
    AdminQualityController,
    AdminStatisticsController,
    AdminManagementController,
  ],
  providers: [AdminService, AdminQualityService, AdminManagementService],
  exports: [AdminService, AdminQualityService],
})
export class AdminModule {}
