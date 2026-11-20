import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { MembershipRoles } from '../../../common/roles';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  CreateTenantAppDto,
  CreateTenantDto,
  UpdateMembershipRolesDto,
} from './tenants.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTenant(dto: CreateTenantDto) {
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new BadRequestException('slug already taken');
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        plan: dto.plan ?? 'starter',
        benefitsConfig: {
          create: {},
        },
      },
    });

    let admin = null;
    if (dto.adminEmail && dto.adminPassword) {
      const passwordHash = await bcrypt.hash(dto.adminPassword, 10);
      const account = await this.prisma.account.upsert({
        where: { email: dto.adminEmail },
        create: {
          email: dto.adminEmail,
          passwordHash,
          displayName: `${dto.name} Admin`,
        },
        update: {},
      });
      const membership = await this.prisma.membership.create({
        data: {
          tenantId: tenant.id,
          accountId: account.id,
          roles: [MembershipRoles.TENANT_ADMIN, MembershipRoles.END_USER],
        },
      });
      await this.prisma.pointsAccount.create({
        data: { tenantId: tenant.id, membershipId: membership.id },
      });
      admin = { accountId: account.id, membershipId: membership.id };
    }

    return { tenant, admin };
  }

  async getTenantById(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { benefitsConfig: true },
    });
    if (!tenant) throw new NotFoundException('tenant not found');
    return tenant;
  }

  async listMemberships(tenantId: string) {
    return this.prisma.membership.findMany({
      where: { tenantId },
      include: {
        account: {
          select: { id: true, email: true, phone: true, displayName: true },
        },
        partnerProfile: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateMembershipRoles(
    tenantId: string,
    membershipId: string,
    dto: UpdateMembershipRolesDto,
  ) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId },
    });
    if (!membership) throw new NotFoundException('membership not found');

    const updated = await this.prisma.membership.update({
      where: { id: membershipId },
      data: { roles: dto.roles },
    });

    // Opening partner role → ensure PartnerProfile + empty storefront
    if (dto.roles.includes(MembershipRoles.PARTNER)) {
      const existing = await this.prisma.partnerProfile.findUnique({
        where: { membershipId },
      });
      if (!existing) {
        const inviteCode = randomBytes(4).toString('hex');
        const partner = await this.prisma.partnerProfile.create({
          data: {
            tenantId,
            membershipId,
            inviteCode,
            status: 'active',
          },
        });
        await this.prisma.partnerStorefront.create({
          data: { tenantId, partnerId: partner.id, items: [] },
        });
      }
    }

    return updated;
  }

  async createApp(tenantId: string, dto: CreateTenantAppDto) {
    const webhookSecret = randomBytes(24).toString('hex');
    return this.prisma.tenantApp.create({
      data: {
        tenantId,
        name: dto.name,
        webhookUrl: dto.webhookUrl,
        webhookSecret,
        scopes: dto.scopes ?? ['orders', 'rewards'],
      },
    });
  }

  async createApiKey(tenantId: string, name: string, scopes: string[] = []) {
    const raw = `sk_${randomBytes(24).toString('hex')}`;
    const prefix = raw.slice(0, 10);
    const keyHash = createHash('sha256').update(raw).digest('hex');
    const record = await this.prisma.apiKey.create({
      data: { tenantId, name, keyHash, prefix, scopes },
    });
    return { id: record.id, prefix, apiKey: raw, scopes: record.scopes };
  }
}
