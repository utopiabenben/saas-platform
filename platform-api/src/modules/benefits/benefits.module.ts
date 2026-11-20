import { Module } from '@nestjs/common';
import { BenefitsController } from './benefits.controller';
import { CommissionService } from './commission.service';
import { PartnerService } from './partner.service';
import { PointsService } from './points.service';

@Module({
  controllers: [BenefitsController],
  providers: [PartnerService, CommissionService, PointsService],
  exports: [PartnerService, CommissionService, PointsService],
})
export class BenefitsModule {}
