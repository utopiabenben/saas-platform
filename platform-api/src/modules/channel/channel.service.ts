import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ChannelService {
  constructor(private readonly prisma: PrismaService) {}

  async createChannel(input: {
    name: string;
    region?: string;
    ownerAccountId: string;
  }) {
    const code = `ch_${randomBytes(4).toString('hex')}`;
    const channel = await this.prisma.channelPartner.create({
      data: {
        code,
        name: input.name,
        region: input.region,
        status: 'active',
        memberships: {
          create: {
            accountId: input.ownerAccountId,
            roleCode: 'channel_owner',
          },
        },
        policies: {
          create: {
            version: 1,
            newPurchaseRate: new Prisma.Decimal('0.2000'),
            renewalRate: new Prisma.Decimal('0.1000'),
          },
        },
      },
    });
    return channel;
  }

  async createLead(
    channelId: string,
    body: { companyName?: string; contactEmail?: string },
  ) {
    const channel = await this.prisma.channelPartner.findUnique({
      where: { id: channelId },
    });
    if (!channel) throw new NotFoundException('channel not found');
    const protectUntil = new Date();
    protectUntil.setDate(protectUntil.getDate() + 30);
    return this.prisma.lead.create({
      data: {
        channelId,
        companyName: body.companyName,
        contactEmail: body.contactEmail,
        stage: 'new',
        protectUntil,
      },
    });
  }

  async attachTenant(
    channelId: string,
    tenantId: string,
    leadId?: string,
  ) {
    const existing = await this.prisma.tenantReferral.findUnique({
      where: { tenantId },
    });
    if (existing) throw new BadRequestException('tenant already referred');
    return this.prisma.tenantReferral.create({
      data: { channelId, tenantId, leadId },
    });
  }

  async recordSubscriptionCommission(input: {
    channelId: string;
    tenantId: string;
    orderId: string;
    amountPaid: number;
    kind: 'new' | 'renewal';
  }) {
    const policy = await this.prisma.channelCommissionPolicy.findFirst({
      where: { channelId: input.channelId, active: true },
      orderBy: { version: 'desc' },
    });
    if (!policy) throw new BadRequestException('no commission policy');
    const rate =
      input.kind === 'new'
        ? Number(policy.newPurchaseRate)
        : Number(policy.renewalRate);
    const amount = input.amountPaid * rate;
    return this.prisma.channelCommissionLedger.create({
      data: {
        channelId: input.channelId,
        tenantId: input.tenantId,
        orderId: input.orderId,
        amount: new Prisma.Decimal(amount.toFixed(2)),
        rate: new Prisma.Decimal(rate),
        status: 'pending',
      },
    });
  }

  listLeads(channelId: string) {
    return this.prisma.lead.findMany({
      where: { channelId },
      orderBy: { createdAt: 'desc' },
    });
  }

  listCommissions(channelId: string) {
    return this.prisma.channelCommissionLedger.findMany({
      where: { channelId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async myChannels(accountId: string) {
    return this.prisma.channelMembership.findMany({
      where: { accountId },
      include: { channel: true },
    });
  }
}
