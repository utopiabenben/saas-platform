import { Module } from '@nestjs/common';
import { OutboxService } from '../../common/outbox/outbox.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, OutboxService],
  exports: [BillingService],
})
export class BillingModule {}
