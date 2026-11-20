import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AffiliateService } from '../affiliate/affiliate.service';
import { LedgerService } from '../ledger/ledger.service';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly affiliate: AffiliateService,
    private readonly ledger: LedgerService,
  ) {}

  async ingest(input: {
    tenantId: string;
    eventType: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
    signature?: string;
    timestamp?: string;
    clientId?: string;
  }) {
    if (!input.tenantId) throw new BadRequestException('x-tenant-id required');
    if (!input.idempotencyKey) {
      throw new BadRequestException('idempotencyKey required');
    }

    if (input.clientId) {
      const app = await this.prisma.tenantApp.findFirst({
        where: { clientId: input.clientId, tenantId: input.tenantId },
      });
      if (!app?.webhookSecret) {
        throw new UnauthorizedException('unknown client');
      }
      if (input.signature && input.timestamp) {
        const expected = createHmac('sha256', app.webhookSecret)
          .update(`${input.timestamp}.${JSON.stringify(input.payload)}`)
          .digest('hex');
        const a = Buffer.from(expected);
        const b = Buffer.from(input.signature);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          throw new UnauthorizedException('invalid signature');
        }
      }
    }

    const existing = await this.prisma.inboxEvent.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: input.tenantId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing?.processedAt) {
      return { ok: true, idempotent: true, inboxId: existing.id };
    }

    const inbox =
      existing ??
      (await this.prisma.inboxEvent.create({
        data: {
          tenantId: input.tenantId,
          eventType: input.eventType,
          idempotencyKey: input.idempotencyKey,
          payload: input.payload as Prisma.InputJsonValue,
        },
      }));

    let result: unknown = null;
    switch (input.eventType) {
      case 'order.paid':
        result = await this.affiliate.handleOrderPaid(input.tenantId, {
          externalOrderId: String(input.payload.externalOrderId),
          amountPaid: Number(input.payload.amountPaid),
          partnerCode: input.payload.partnerCode
            ? String(input.payload.partnerCode)
            : undefined,
          accountId: input.payload.accountId
            ? String(input.payload.accountId)
            : undefined,
          tenantAppId: input.payload.tenantAppId
            ? String(input.payload.tenantAppId)
            : undefined,
          idempotencyKey: input.idempotencyKey,
        });
        break;
      case 'order.refunded':
        result = await this.affiliate.handleOrderRefunded(input.tenantId, {
          externalOrderId: String(input.payload.externalOrderId),
          idempotencyKey: input.idempotencyKey,
        });
        break;
      case 'usage.recorded':
        result = await this.ledger.recordUsage({
          tenantId: input.tenantId,
          tenantAppId: input.payload.tenantAppId
            ? String(input.payload.tenantAppId)
            : undefined,
          metricCode: String(input.payload.metricCode),
          quantity: Number(input.payload.quantity),
          idempotencyKey: input.idempotencyKey,
          requestId: input.payload.requestId
            ? String(input.payload.requestId)
            : undefined,
        });
        break;
      case 'user.registered':
      case 'share.clicked':
        result = { accepted: true };
        break;
      default:
        throw new BadRequestException(`unsupported eventType: ${input.eventType}`);
    }

    await this.prisma.inboxEvent.update({
      where: { id: inbox.id },
      data: { processedAt: new Date() },
    });

    return { ok: true, idempotent: false, inboxId: inbox.id, result };
  }
}
