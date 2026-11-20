import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OutboxService } from '../../common/outbox/outbox.service';

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async getPoints(tenantId: string, membershipId: string) {
    const account = await this.prisma.pointsAccount.findFirst({
      where: { tenantId, membershipId },
      include: {
        ledgers: { orderBy: { createdAt: 'desc' }, take: 50 },
        lots: true,
      },
    });
    if (!account) throw new NotFoundException('points account not found');
    return account;
  }

  async earnPoints(input: {
    tenantId: string;
    membershipId: string;
    amount: number;
    reason: string;
    eventId?: string;
    expiresAt?: Date;
  }) {
    if (input.amount <= 0) throw new BadRequestException('amount must be > 0');
    const account = await this.prisma.pointsAccount.findFirst({
      where: { tenantId: input.tenantId, membershipId: input.membershipId },
    });
    if (!account) throw new NotFoundException('points account not found');

    if (input.eventId) {
      const dup = await this.prisma.pointsLedger.findUnique({
        where: {
          tenantId_eventId: {
            tenantId: input.tenantId,
            eventId: input.eventId,
          },
        },
      });
      if (dup) return dup;
    }

    return this.prisma.$transaction(async (tx) => {
      const ledger = await tx.pointsLedger.create({
        data: {
          tenantId: input.tenantId,
          pointsAccountId: account.id,
          type: 'earn',
          amount: input.amount,
          reason: input.reason,
          eventId: input.eventId,
        },
      });
      await tx.pointsAccount.update({
        where: { id: account.id },
        data: { balanceCache: { increment: input.amount } },
      });
      await tx.pointsLot.create({
        data: {
          pointsAccountId: account.id,
          remaining: input.amount,
          expiresAt: input.expiresAt,
        },
      });
      return ledger;
    });
  }

  async redeem(tenantId: string, membershipId: string, rewardId: string) {
    const account = await this.prisma.pointsAccount.findFirst({
      where: { tenantId, membershipId },
    });
    if (!account) throw new NotFoundException('points account not found');
    const reward = await this.prisma.rewardCatalog.findFirst({
      where: { id: rewardId, tenantId, active: true },
    });
    if (!reward) throw new NotFoundException('reward not found');
    if (account.balanceCache < reward.pointsPrice) {
      throw new BadRequestException('insufficient points');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.pointsAccount.updateMany({
        where: {
          id: account.id,
          balanceCache: { gte: reward.pointsPrice },
        },
        data: { balanceCache: { decrement: reward.pointsPrice } },
      });
      if (updated.count === 0) {
        throw new BadRequestException('insufficient points');
      }
      const ledger = await tx.pointsLedger.create({
        data: {
          tenantId,
          pointsAccountId: account.id,
          type: 'redeem',
          amount: -reward.pointsPrice,
          reason: `redeem:${reward.sku}`,
        },
      });
      if (reward.stock != null) {
        await tx.rewardCatalog.update({
          where: { id: reward.id },
          data: { stock: { decrement: 1 } },
        });
      }
      const redemption = await tx.redemption.create({
        data: {
          tenantId,
          rewardId: reward.id,
          pointsLedgerId: ledger.id,
          fulfillStatus: 'pending',
        },
      });
      return { ledger, redemption, reward };
    });

    await this.outbox.enqueue({
      tenantId,
      eventType: 'reward.granted',
      payload: {
        redemptionId: result.redemption.id,
        sku: reward.sku,
        membershipId,
      },
    });

    return result;
  }

  listRewards(tenantId: string) {
    return this.prisma.rewardCatalog.findMany({
      where: { tenantId, active: true },
      orderBy: { pointsPrice: 'asc' },
    });
  }

  async recordUsage(input: {
    tenantId: string;
    tenantAppId?: string;
    metricCode: string;
    quantity: bigint | number;
    idempotencyKey: string;
    requestId?: string;
  }) {
    const qty = BigInt(input.quantity);
    const existing = await this.prisma.usageEvent.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: input.tenantId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) return { event: existing, idempotent: true };

    const account = await this.prisma.usageAccount.findUnique({
      where: {
        tenantId_metricCode: {
          tenantId: input.tenantId,
          metricCode: input.metricCode,
        },
      },
    });
    if (!account) {
      throw new BadRequestException(`usage account missing: ${input.metricCode}`);
    }
    if (account.balanceCache < qty) {
      throw new BadRequestException('quota exhausted');
    }

    const event = await this.prisma.$transaction(async (tx) => {
      const ev = await tx.usageEvent.create({
        data: {
          tenantId: input.tenantId,
          tenantAppId: input.tenantAppId,
          metricCode: input.metricCode,
          quantity: qty,
          idempotencyKey: input.idempotencyKey,
          requestId: input.requestId,
        },
      });
      const updated = await tx.usageAccount.updateMany({
        where: { id: account.id, balanceCache: { gte: qty } },
        data: { balanceCache: { decrement: qty } },
      });
      if (updated.count === 0) {
        throw new BadRequestException('quota exhausted');
      }
      await tx.usageLedger.create({
        data: {
          usageAccountId: account.id,
          direction: 'debit',
          amount: qty,
          reason: 'usage',
          eventId: input.idempotencyKey,
        },
      });
      return ev;
    });

    return { event, idempotent: false };
  }

  async usageSummary(tenantId: string) {
    const accounts = await this.prisma.usageAccount.findMany({
      where: { tenantId },
    });
    return accounts.map((a) => ({
      metricCode: a.metricCode,
      balance: a.balanceCache.toString(),
    }));
  }

  listEntitlements(tenantId: string) {
    return this.prisma.entitlement.findMany({
      where: { tenantId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }
}
