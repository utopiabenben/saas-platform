import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { TenantRoleCodes } from '../../common/roles';
import {
  AcceptInvitationDto,
  CreateTenantDto,
  InviteMemberDto,
  UpdateMembershipRolesDto,
} from './tenant.dto';

@Injectable()
export class TenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createTenant(dto: CreateTenantDto, ownerAccountId?: string) {
    const exists = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });
    if (exists) throw new BadRequestException('slug already taken');

    const tenant = await this.prisma.tenant.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        timezone: dto.timezone ?? 'Asia/Shanghai',
        currency: dto.currency ?? 'CNY',
        status: 'trial',
        profile: { create: {} },
      },
    });

    await this.ensureTenantRoles(tenant.id);

    if (ownerAccountId) {
      await this.addMemberWithRoles(tenant.id, ownerAccountId, [
        TenantRoleCodes.TENANT_OWNER,
        TenantRoleCodes.TENANT_ADMIN,
        TenantRoleCodes.MEMBER,
      ]);
    }

    await this.audit.log({
      tenantId: tenant.id,
      actorAccountId: ownerAccountId,
      action: 'tenant.create',
      resource: `tenant:${tenant.id}`,
    });

    return tenant;
  }

  async getTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { profile: true },
    });
    if (!tenant) throw new NotFoundException('tenant not found');
    return tenant;
  }

  async listMembers(tenantId: string) {
    return this.prisma.membership.findMany({
      where: { tenantId },
      include: {
        account: {
          select: { id: true, displayName: true, status: true },
        },
        roles: { include: { role: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async invite(
    tenantId: string,
    inviterAccountId: string,
    dto: InviteMemberDto,
  ) {
    const token = randomBytes(24).toString('hex');
    const invitation = await this.prisma.invitation.create({
      data: {
        tenantId,
        email: dto.email.toLowerCase(),
        roleCodes: dto.roleCodes,
        tokenHash: this.hash(token),
        invitedById: inviterAccountId,
        expiresAt: new Date(Date.now() + 7 * 86400_000),
      },
    });
    await this.audit.log({
      tenantId,
      actorAccountId: inviterAccountId,
      action: 'tenant.invite',
      resource: `invitation:${invitation.id}`,
      meta: { email: dto.email },
    });
    // Return raw token once (email delivery stub)
    return { invitationId: invitation.id, token, expiresAt: invitation.expiresAt };
  }

  async acceptInvitation(accountId: string, dto: AcceptInvitationDto) {
    const invitation = await this.prisma.invitation.findFirst({
      where: {
        tokenHash: this.hash(dto.token),
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    });
    if (!invitation) throw new NotFoundException('invitation not found or expired');

    await this.addMemberWithRoles(
      invitation.tenantId,
      accountId,
      invitation.roleCodes.length
        ? invitation.roleCodes
        : [TenantRoleCodes.MEMBER],
    );

    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'accepted', acceptedAt: new Date() },
    });

    return { tenantId: invitation.tenantId, ok: true };
  }

  async revokeInvitation(tenantId: string, invitationId: string) {
    const inv = await this.prisma.invitation.findFirst({
      where: { id: invitationId, tenantId },
    });
    if (!inv) throw new NotFoundException('invitation not found');
    return this.prisma.invitation.update({
      where: { id: invitationId },
      data: { status: 'revoked' },
    });
  }

  async disableMembership(
    tenantId: string,
    membershipId: string,
    actorAccountId?: string,
  ) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId },
    });
    if (!membership) throw new NotFoundException('membership not found');

    const updated = await this.prisma.membership.update({
      where: { id: membershipId },
      data: { status: 'disabled' },
    });

    // Revoke all sessions for this account (IAM-002)
    await this.prisma.session.updateMany({
      where: { accountId: membership.accountId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.audit.log({
      tenantId,
      actorAccountId,
      action: 'membership.disable',
      resource: `membership:${membershipId}`,
    });

    return updated;
  }

  async updateRoles(
    tenantId: string,
    membershipId: string,
    dto: UpdateMembershipRolesDto,
  ) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId },
    });
    if (!membership) throw new NotFoundException('membership not found');

    const roles = await this.prisma.role.findMany({
      where: {
        OR: [{ tenantId }, { tenantId: null }],
        code: { in: dto.roleCodes },
      },
    });
    if (roles.length !== dto.roleCodes.length) {
      throw new BadRequestException('unknown role code');
    }

    await this.prisma.membershipRole.deleteMany({ where: { membershipId } });
    await this.prisma.membershipRole.createMany({
      data: roles.map((r) => ({ membershipId, roleId: r.id })),
    });

    return this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: { roles: { include: { role: true } } },
    });
  }

  assertTenantAccess(userTenantId: string | undefined, resourceTenantId: string) {
    if (!userTenantId || userTenantId !== resourceTenantId) {
      throw new UnauthorizedException('cross-tenant access denied');
    }
  }

  private async ensureTenantRoles(tenantId: string) {
    const codes = Object.values(TenantRoleCodes);
    for (const code of codes) {
      await this.prisma.role.upsert({
        where: { tenantId_code: { tenantId, code } },
        create: { tenantId, code, name: code, scope: 'tenant' },
        update: {},
      });
    }
  }

  private async addMemberWithRoles(
    tenantId: string,
    accountId: string,
    roleCodes: string[],
  ) {
    await this.ensureTenantRoles(tenantId);
    const membership = await this.prisma.membership.upsert({
      where: { tenantId_accountId: { tenantId, accountId } },
      create: { tenantId, accountId, status: 'active' },
      update: { status: 'active' },
    });

    const roles = await this.prisma.role.findMany({
      where: { tenantId, code: { in: roleCodes } },
    });
    for (const role of roles) {
      await this.prisma.membershipRole.upsert({
        where: {
          membershipId_roleId: { membershipId: membership.id, roleId: role.id },
        },
        create: { membershipId: membership.id, roleId: role.id },
        update: {},
      });
    }

    await this.prisma.pointsAccount.upsert({
      where: { membershipId: membership.id },
      create: { tenantId, membershipId: membership.id },
      update: {},
    });

    return membership;
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
