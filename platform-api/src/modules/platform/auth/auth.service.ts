import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MembershipRoles } from '../../../common/roles';
import { LoginDto, RegisterDto, SwitchTenantDto } from './auth.dto';

export type JwtPayload = {
  sub: string;
  tenantId?: string;
  tenantSlug?: string;
  membershipId?: string;
  roles?: string[];
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('email or phone required');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const account = await this.prisma.account.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        displayName: dto.displayName,
      },
    });

    let membership = null;
    let tenant = null;
    if (dto.tenantSlug) {
      tenant = await this.prisma.tenant.findUnique({
        where: { slug: dto.tenantSlug },
      });
      if (!tenant) {
        throw new BadRequestException(`tenant not found: ${dto.tenantSlug}`);
      }
      membership = await this.prisma.membership.create({
        data: {
          tenantId: tenant.id,
          accountId: account.id,
          roles: [MembershipRoles.END_USER],
        },
      });
      await this.prisma.pointsAccount.create({
        data: {
          tenantId: tenant.id,
          membershipId: membership.id,
        },
      });
    }

    const token = await this.sign({
      sub: account.id,
      tenantId: tenant?.id,
      tenantSlug: tenant?.slug,
      membershipId: membership?.id,
      roles: membership?.roles,
    });

    return {
      accessToken: token,
      account: {
        id: account.id,
        email: account.email,
        phone: account.phone,
        displayName: account.displayName,
      },
      tenant: tenant
        ? { id: tenant.id, slug: tenant.slug, name: tenant.name }
        : null,
    };
  }

  async login(dto: LoginDto) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('email or phone required');
    }

    const account = await this.prisma.account.findFirst({
      where: {
        OR: [
          dto.email ? { email: dto.email } : undefined,
          dto.phone ? { phone: dto.phone } : undefined,
        ].filter(Boolean) as Array<{ email?: string; phone?: string }>,
      },
    });

    if (!account?.passwordHash) {
      throw new UnauthorizedException('invalid credentials');
    }
    const ok = await bcrypt.compare(dto.password, account.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('invalid credentials');
    }

    let membership = null;
    let tenant = null;
    if (dto.tenantSlug) {
      tenant = await this.prisma.tenant.findUnique({
        where: { slug: dto.tenantSlug },
      });
      if (!tenant) {
        throw new BadRequestException(`tenant not found: ${dto.tenantSlug}`);
      }
      membership = await this.prisma.membership.findUnique({
        where: {
          tenantId_accountId: {
            tenantId: tenant.id,
            accountId: account.id,
          },
        },
      });
      if (!membership) {
        throw new UnauthorizedException('not a member of this tenant');
      }
    }

    const token = await this.sign({
      sub: account.id,
      tenantId: tenant?.id,
      tenantSlug: tenant?.slug,
      membershipId: membership?.id,
      roles: membership?.roles,
    });

    return {
      accessToken: token,
      account: {
        id: account.id,
        email: account.email,
        phone: account.phone,
        displayName: account.displayName,
      },
      tenant: tenant
        ? { id: tenant.id, slug: tenant.slug, name: tenant.name }
        : null,
      roles: membership?.roles ?? [],
    };
  }

  async switchTenant(accountId: string, dto: SwitchTenantDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
    });
    if (!tenant) {
      throw new BadRequestException(`tenant not found: ${dto.tenantSlug}`);
    }
    const membership = await this.prisma.membership.findUnique({
      where: {
        tenantId_accountId: { tenantId: tenant.id, accountId },
      },
    });
    if (!membership) {
      throw new UnauthorizedException('not a member of this tenant');
    }

    const token = await this.sign({
      sub: accountId,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      membershipId: membership.id,
      roles: membership.roles,
    });

    return {
      accessToken: token,
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      roles: membership.roles,
    };
  }

  private sign(payload: JwtPayload) {
    return this.jwt.signAsync(payload);
  }
}
