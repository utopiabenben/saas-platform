import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrderPaidEventDto, OrderRefundedEventDto } from './benefits.dto';

@Injectable()
export class CommissionService {
  constructor(private readonly prisma: PrismaService) {}

  async handleOrderPaid(tenantId: string, dto: OrderPaidEventDto) {
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: {
        tenantId_scope_key: {
          tenantId,
          scope: 'order.paid',
          key: dto.idempotencyKey,
        },
      },
    });
    if (existing?.responseRef) {
      return existing.responseRef;
    }

    const config = await this.prisma.tenantBenefitsConfig.findUnique({
      where: { tenantId },
    });
    const holdDays = config?.refundHoldDays ?? 10;
    const defaultRate = config?.defaultCommissionRate ?? 0.3;

    let partnerId = dto.partnerId;
    if (!partnerId && dto.partnerCode) {
      const partner = await this.prisma.partnerProfile.findUnique({
        where: {
          tenantId_inviteCode: {
            tenantId,
            inviteCode: dto.partnerCode,
          },
        },
      });
      partnerId = partner?.id;
    }

    let appId: string | undefined;
    if (dto.appClientId) {
      const app = await this.prisma.tenantApp.findUnique({
        where: { clientId: dto.appClientId },
      });
      appId = app?.id;
    }

    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    const orderRef = await this.prisma.orderRef.create({
      data: {
        tenantId,
        appId,
        externalOrderId: dto.externalOrderId,
        amountPaid: new Prisma.Decimal(dto.amountPaid),
        currency: dto.currency ?? 'CNY',
        partnerId,
        accountId: dto.accountId,
        paidAt,
      },
    });

    let commission = null;
    if (partnerId) {
      const partner = await this.prisma.partnerProfile.findUniqueOrThrow({
        where: { id: partnerId },
      });
      const rate = partner.commissionRate ?? defaultRate;
      const amount = Number(dto.amountPaid) * rate;
      const holdUntil = new Date(paidAt);
      holdUntil.setDate(holdUntil.getDate() + holdDays);

      commission = await this.prisma.commissionLedger.create({
        data: {
          tenantId,
          orderRefId: orderRef.id,
          partnerId,
          amount: new Prisma.Decimal(amount.toFixed(2)),
          rate,
          status: 'pending',
          holdUntil,
        },
      });
    }

    const result = { orderRef, commission };
    await this.prisma.idempotencyKey.create({
      data: {
        tenantId,
        scope: 'order.paid',
        key: dto.idempotencyKey,
        responseRef: result as unknown as Prisma.InputJsonValue,
      },
    });
    return result;
  }

  async handleOrderRefunded(tenantId: string, dto: OrderRefundedEventDto) {
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: {
        tenantId_scope_key: {
          tenantId,
          scope: 'order.refunded',
          key: dto.idempotencyKey,
        },
      },
    });
    if (existing?.responseRef) {
      return existing.responseRef;
    }

    const orderRef = await this.prisma.orderRef.findUnique({
      where: {
        tenantId_externalOrderId: {
          tenantId,
          externalOrderId: dto.externalOrderId,
        },
      },
      include: { commissions: true },
    });
    if (!orderRef) {
      throw new NotFoundException('order not found');
    }

    await this.prisma.orderRef.update({
      where: { id: orderRef.id },
      data: { refundedAt: new Date() },
    });

    const clawbacks = [];
    for (const c of orderRef.commissions) {
      if (c.status === 'clawback') continue;
      const refundAmount =
        dto.refundAmount != null
          ? Number(dto.refundAmount) * c.rate
          : Number(c.amount);
      const clawback = await this.prisma.commissionLedger.create({
        data: {
          tenantId,
          orderRefId: orderRef.id,
          partnerId: c.partnerId,
          amount: new Prisma.Decimal((-Math.abs(refundAmount)).toFixed(2)),
          rate: c.rate,
          status: 'clawback',
          clawbackOfId: c.id,
        },
      });
      await this.prisma.commissionLedger.update({
        where: { id: c.id },
        data: { status: 'clawback' },
      });
      clawbacks.push(clawback);
    }

    const result = { orderRefId: orderRef.id, clawbacks };
    await this.prisma.idempotencyKey.create({
      data: {
        tenantId,
        scope: 'order.refunded',
        key: dto.idempotencyKey,
        responseRef: result as unknown as Prisma.InputJsonValue,
      },
    });
    return result;
  }

  /** Promote pending → eligible after hold period (worker entry). */
  async promoteEligible(now = new Date()) {
    const result = await this.prisma.commissionLedger.updateMany({
      where: {
        status: 'pending',
        holdUntil: { lte: now },
      },
      data: { status: 'eligible' },
    });
    return { promoted: result.count };
  }
}
