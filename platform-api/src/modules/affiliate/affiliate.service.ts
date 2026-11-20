import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AffiliateService {
  constructor(private readonly prisma: PrismaService) {}

  async activatePartner(tenantId: string, membershipId: string, rate = 0.3) {
    const existing = await this.prisma.affiliatePartner.findUnique({
      where: { membershipId },
    });
    if (existing) return existing;

    const inviteCode = randomBytes(4).toString('hex');
    const partner = await this.prisma.affiliatePartner.create({
      data: {
        tenantId,
        membershipId,
        inviteCode,
        commissionRate: new Prisma.Decimal(rate),
        status: 'active',
      },
    });
    await this.prisma.partnerStorefront.create({
      data: { tenantId, partnerId: partner.id, items: [] },
    });
    return partner;
  }

  async getStorefront(tenantSlug: string, code: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });
    if (!tenant) throw new NotFoundException('tenant not found');
    const partner = await this.prisma.affiliatePartner.findUnique({
      where: {
        tenantId_inviteCode: { tenantId: tenant.id, inviteCode: code },
      },
      include: { storefront: true },
    });
    if (!partner || partner.status !== 'active') {
      throw new NotFoundException('partner not found');
    }
    return {
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      partner: { id: partner.id, inviteCode: partner.inviteCode },
      items: partner.storefront?.items ?? [],
    };
  }

  async handleOrderPaid(
    tenantId: string,
    body: {
      externalOrderId: string;
      amountPaid: number;
      partnerCode?: string;
      accountId?: string;
      tenantAppId?: string;
      idempotencyKey: string;
    },
  ) {
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: {
        tenantId_scope_key: {
          tenantId,
          scope: 'affiliate.order.paid',
          key: body.idempotencyKey,
        },
      },
    });
    if (existing?.responseRef) return existing.responseRef;

    let partnerId: string | undefined;
    if (body.partnerCode) {
      const partner = await this.prisma.affiliatePartner.findUnique({
        where: {
          tenantId_inviteCode: {
            tenantId,
            inviteCode: body.partnerCode,
          },
        },
      });
      partnerId = partner?.id;
    }

    const paidAt = new Date();
    const orderRef = await this.prisma.orderRef.create({
      data: {
        tenantId,
        tenantAppId: body.tenantAppId,
        externalOrderId: body.externalOrderId,
        amountPaid: new Prisma.Decimal(body.amountPaid),
        partnerId,
        accountId: body.accountId,
        paidAt,
      },
    });

    let commission = null;
    if (partnerId) {
      const partner = await this.prisma.affiliatePartner.findUniqueOrThrow({
        where: { id: partnerId },
      });
      const rate = Number(partner.commissionRate);
      const amount = body.amountPaid * rate;
      const holdUntil = new Date(paidAt);
      holdUntil.setDate(holdUntil.getDate() + 10);
      commission = await this.prisma.affiliateCommissionLedger.create({
        data: {
          tenantId,
          orderRefId: orderRef.id,
          partnerId,
          amount: new Prisma.Decimal(amount.toFixed(2)),
          rate: partner.commissionRate,
          status: 'pending',
          holdUntil,
        },
      });
    }

    const result = { orderRef, commission };
    await this.prisma.idempotencyKey.create({
      data: {
        tenantId,
        scope: 'affiliate.order.paid',
        key: body.idempotencyKey,
        responseRef: JSON.parse(JSON.stringify(result)),
      },
    });
    return result;
  }

  async handleOrderRefunded(
    tenantId: string,
    body: { externalOrderId: string; idempotencyKey: string },
  ) {
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: {
        tenantId_scope_key: {
          tenantId,
          scope: 'affiliate.order.refunded',
          key: body.idempotencyKey,
        },
      },
    });
    if (existing?.responseRef) return existing.responseRef;

    const orderRef = await this.prisma.orderRef.findUnique({
      where: {
        tenantId_externalOrderId: {
          tenantId,
          externalOrderId: body.externalOrderId,
        },
      },
      include: { commissions: true },
    });
    if (!orderRef) throw new NotFoundException('order not found');

    await this.prisma.orderRef.update({
      where: { id: orderRef.id },
      data: { refundedAt: new Date() },
    });

    const clawbacks = [];
    for (const c of orderRef.commissions) {
      if (c.status === 'clawback' || c.status === 'reversed') continue;
      const clawback = await this.prisma.affiliateCommissionLedger.create({
        data: {
          tenantId,
          orderRefId: orderRef.id,
          partnerId: c.partnerId,
          amount: new Prisma.Decimal((-Number(c.amount)).toFixed(2)),
          rate: c.rate,
          status: 'clawback',
          clawbackOfId: c.id,
        },
      });
      await this.prisma.affiliateCommissionLedger.update({
        where: { id: c.id },
        data: { status: 'reversed' },
      });
      clawbacks.push(clawback);
    }

    const result = { orderRefId: orderRef.id, clawbacks };
    await this.prisma.idempotencyKey.create({
      data: {
        tenantId,
        scope: 'affiliate.order.refunded',
        key: body.idempotencyKey,
        responseRef: JSON.parse(JSON.stringify(result)),
      },
    });
    return result;
  }

  async updateStorefront(
    tenantId: string,
    membershipId: string,
    items: Array<{ courseId: string; sort: number }>,
  ) {
    const partner = await this.prisma.affiliatePartner.findFirst({
      where: { tenantId, membershipId },
    });
    if (!partner) throw new NotFoundException('affiliate partner not found');
    if (items.length > 8) throw new BadRequestException('max 8 items');
    return this.prisma.partnerStorefront.upsert({
      where: { partnerId: partner.id },
      create: {
        tenantId,
        partnerId: partner.id,
        items: items as unknown as Prisma.InputJsonValue,
      },
      update: { items: items as unknown as Prisma.InputJsonValue },
    });
  }

  listCommissions(tenantId: string, membershipId: string) {
    return this.prisma.affiliatePartner
      .findFirst({ where: { tenantId, membershipId } })
      .then(async (p) => {
        if (!p) throw new NotFoundException('partner not found');
        return this.prisma.affiliateCommissionLedger.findMany({
          where: { tenantId, partnerId: p.id },
          orderBy: { createdAt: 'desc' },
        });
      });
  }
}
