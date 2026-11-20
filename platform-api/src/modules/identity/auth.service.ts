import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { LoginDto, RefreshDto, RegisterDto, SwitchTenantDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterDto) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('email or phone required');
    }
    const provider = dto.email ? 'password_email' : 'password_phone';
    const identifier = (dto.email ?? dto.phone)!.toLowerCase();
    const existing = await this.prisma.accountIdentity.findUnique({
      where: { provider_identifier: { provider, identifier } },
    });
    if (existing) throw new BadRequestException('identity already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const account = await this.prisma.account.create({
      data: {
        displayName: dto.displayName ?? identifier,
        identities: {
          create: {
            provider,
            identifier,
            verifiedAt: new Date(),
            credentialRef: passwordHash,
          },
        },
      },
    });

    const tokens = await this.issueTokens(account.id);
    return {
      account: { id: account.id, displayName: account.displayName },
      ...tokens,
    };
  }

  async login(dto: LoginDto, ip?: string) {
    const provider = dto.email ? 'password_email' : 'password_phone';
    const identifier = (dto.email ?? dto.phone)?.toLowerCase();
    if (!identifier) throw new BadRequestException('email or phone required');

    const identity = await this.prisma.accountIdentity.findUnique({
      where: { provider_identifier: { provider, identifier } },
      include: { account: true },
    });
    if (!identity?.credentialRef || identity.account.status !== 'active') {
      throw new UnauthorizedException('invalid credentials');
    }
    const ok = await bcrypt.compare(dto.password, identity.credentialRef);
    if (!ok) {
      await this.prisma.accountSecurityEvent.create({
        data: {
          accountId: identity.accountId,
          type: 'login_failed',
          ip,
        },
      });
      throw new UnauthorizedException('invalid credentials');
    }

    let membership = null;
    let tenantSlug = dto.tenantSlug;
    if (dto.tenantSlug) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: dto.tenantSlug },
      });
      if (!tenant) throw new BadRequestException('tenant not found');
      membership = await this.prisma.membership.findUnique({
        where: {
          tenantId_accountId: {
            tenantId: tenant.id,
            accountId: identity.accountId,
          },
        },
        include: { roles: { include: { role: true } } },
      });
      if (!membership || membership.status !== 'active') {
        throw new UnauthorizedException('not a member of this tenant');
      }
    } else {
      membership = await this.prisma.membership.findFirst({
        where: { accountId: identity.accountId, status: 'active' },
        include: {
          roles: { include: { role: true } },
          tenant: true,
        },
      });
      if (membership && 'tenant' in membership && membership.tenant) {
        tenantSlug = membership.tenant.slug;
      }
    }

    const roleCodes =
      membership?.roles.map((r) => r.role.code) ?? ([] as string[]);
    const tokens = await this.issueTokens(
      identity.accountId,
      membership
        ? {
            tenantId: membership.tenantId,
            membershipId: membership.id,
            roleCodes,
            tenantSlug,
          }
        : undefined,
      ip,
    );

    await this.audit.log({
      tenantId: membership?.tenantId,
      actorAccountId: identity.accountId,
      action: 'auth.login',
      resource: `account:${identity.accountId}`,
      ip,
    });

    return {
      account: {
        id: identity.accountId,
        displayName: identity.account.displayName,
      },
      membership: membership
        ? {
            id: membership.id,
            tenantId: membership.tenantId,
            roleCodes,
          }
        : null,
      ...tokens,
    };
  }

  async refresh(dto: RefreshDto) {
    const hash = this.hashToken(dto.refreshToken);
    const session = await this.prisma.session.findFirst({
      where: {
        refreshTokenHash: hash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!session) throw new UnauthorizedException('invalid refresh token');
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(session.accountId);
  }

  async logout(refreshToken: string) {
    const hash = this.hashToken(refreshToken);
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async switchTenant(accountId: string, dto: SwitchTenantDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
    });
    if (!tenant) throw new BadRequestException('tenant not found');
    const membership = await this.prisma.membership.findUnique({
      where: {
        tenantId_accountId: { tenantId: tenant.id, accountId },
      },
      include: { roles: { include: { role: true } } },
    });
    if (!membership || membership.status !== 'active') {
      throw new UnauthorizedException('not a member of this tenant');
    }
    const roleCodes = membership.roles.map((r) => r.role.code);
    const tokens = await this.issueTokens(accountId, {
      tenantId: tenant.id,
      membershipId: membership.id,
      roleCodes,
      tenantSlug: tenant.slug,
    });
    return { membership: { id: membership.id, tenantId: tenant.id, roleCodes }, ...tokens };
  }

  async me(accountId: string) {
    return this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        locale: true,
        identities: {
          select: {
            id: true,
            provider: true,
            identifier: true,
            verifiedAt: true,
          },
        },
        sessions: {
          where: { revokedAt: null, expiresAt: { gt: new Date() } },
          select: {
            id: true,
            device: true,
            ip: true,
            expiresAt: true,
            createdAt: true,
          },
        },
      },
    });
  }

  private async issueTokens(
    accountId: string,
    tenant?: {
      tenantId: string;
      membershipId: string;
      roleCodes: string[];
      tenantSlug?: string;
    },
    ip?: string,
  ) {
    const refreshToken = randomBytes(32).toString('hex');
    const refreshDays = Number(this.config.get('REFRESH_EXPIRES_DAYS') ?? 30);
    const session = await this.prisma.session.create({
      data: {
        accountId,
        refreshTokenHash: this.hashToken(refreshToken),
        ip,
        expiresAt: new Date(Date.now() + refreshDays * 86400_000),
      },
    });

    const accessToken = await this.jwt.signAsync(
      {
        sub: accountId,
        accountId,
        tenantId: tenant?.tenantId,
        membershipId: tenant?.membershipId,
        roleCodes: tenant?.roleCodes ?? [],
        tenantSlug: tenant?.tenantSlug,
        sessionId: session.id,
      },
      {
        secret: this.config.get<string>('JWT_SECRET', 'dev-change-me'),
        expiresIn: this.config.get('JWT_EXPIRES_IN', '2h') as `${number}h`,
      },
    );

    return { accessToken, refreshToken, sessionId: session.id };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
