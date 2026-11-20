import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateStorefrontDto } from './benefits.dto';

@Injectable()
export class PartnerService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyPartner(tenantId: string, membershipId: string) {
    const partner = await this.prisma.partnerProfile.findFirst({
      where: { tenantId, membershipId },
      include: { storefront: true },
    });
    if (!partner) throw new NotFoundException('partner profile not found');
    return partner;
  }

  async getPublicStorefront(tenantSlug: string, partnerCode: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      include: { benefitsConfig: true },
    });
    if (!tenant) throw new NotFoundException('tenant not found');

    const partner = await this.prisma.partnerProfile.findUnique({
      where: {
        tenantId_inviteCode: {
          tenantId: tenant.id,
          inviteCode: partnerCode,
        },
      },
      include: { storefront: true },
    });
    if (!partner || partner.status !== 'active') {
      throw new NotFoundException('partner not found');
    }

    return {
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      partner: {
        id: partner.id,
        inviteCode: partner.inviteCode,
      },
      storefront: partner.storefront?.items ?? [],
      maxItems: tenant.benefitsConfig?.storefrontMaxItems ?? 8,
    };
  }

  async updateStorefront(
    tenantId: string,
    membershipId: string,
    dto: UpdateStorefrontDto,
  ) {
    const partner = await this.getMyPartner(tenantId, membershipId);
    const config = await this.prisma.tenantBenefitsConfig.findUnique({
      where: { tenantId },
    });
    const max = config?.storefrontMaxItems ?? 8;
    if (dto.items.length > max) {
      throw new BadRequestException(`storefront max items is ${max}`);
    }
    const items = dto.items as unknown as Prisma.InputJsonValue;
    return this.prisma.partnerStorefront.upsert({
      where: { partnerId: partner.id },
      create: {
        tenantId,
        partnerId: partner.id,
        items,
      },
      update: { items },
    });
  }

  async listCommissions(tenantId: string, membershipId: string) {
    const partner = await this.getMyPartner(tenantId, membershipId);
    return this.prisma.commissionLedger.findMany({
      where: { tenantId, partnerId: partner.id },
      include: {
        orderRef: {
          select: {
            externalOrderId: true,
            amountPaid: true,
            paidAt: true,
            refundedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listStatements(tenantId: string, membershipId: string) {
    const partner = await this.getMyPartner(tenantId, membershipId);
    return this.prisma.settlementStatement.findMany({
      where: { tenantId, partnerId: partner.id },
      orderBy: { periodStart: 'desc' },
    });
  }
}
