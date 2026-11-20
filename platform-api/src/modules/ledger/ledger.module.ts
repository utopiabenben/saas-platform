import { Module } from '@nestjs/common';
import { OutboxService } from '../../common/outbox/outbox.service';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';

@Module({
  controllers: [LedgerController],
  providers: [LedgerService, OutboxService],
  exports: [LedgerService],
})
export class LedgerModule {}
