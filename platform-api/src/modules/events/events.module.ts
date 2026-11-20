import { Module } from '@nestjs/common';
import { AffiliateModule } from '../affiliate/affiliate.module';
import { LedgerModule } from '../ledger/ledger.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [AffiliateModule, LedgerModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
