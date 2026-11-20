import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';

@Module({
  controllers: [TenantController],
  providers: [TenantService, AuditService],
  exports: [TenantService],
})
export class TenantModule {}
