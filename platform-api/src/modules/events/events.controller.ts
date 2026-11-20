import { Body, Controller, Headers, Post } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller('internal')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post('events')
  ingest(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-signature') signature: string | undefined,
    @Headers('x-timestamp') timestamp: string | undefined,
    @Headers('x-client-id') clientId: string | undefined,
    @Body()
    body: {
      eventType: string;
      idempotencyKey: string;
      payload: Record<string, unknown>;
    },
  ) {
    return this.events.ingest({
      tenantId,
      eventType: body.eventType,
      idempotencyKey: body.idempotencyKey,
      payload: body.payload ?? {},
      signature,
      timestamp,
      clientId,
    });
  }
}
