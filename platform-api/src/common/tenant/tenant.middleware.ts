import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TenantContext } from './tenant.context';

/**
 * Resolves tenant from:
 * 1. X-Tenant-Id / X-Tenant-Slug headers (service-to-service / admin)
 * 2. JWT payload (populated later by AuthGuard onto req.user)
 *
 * Public storefront routes may skip auth but still need tenant slug via host or header.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const headerTenantId = req.header('x-tenant-id') ?? undefined;
    const headerTenantSlug = req.header('x-tenant-slug') ?? undefined;
    const user = (
      req as Request & {
        user?: {
          tenantId?: string;
          tenantSlug?: string;
          accountId?: string;
          membershipId?: string;
          roles?: string[];
        };
      }
    ).user;

    const tenantId = user?.tenantId ?? headerTenantId;
    if (!tenantId && !headerTenantSlug) {
      // Allow health & auth bootstrap without tenant; controllers enforce when needed.
      return next();
    }

    if (!tenantId) {
      // Slug-only resolution happens in services; middleware stores slug for later.
      return TenantContext.run(
        { tenantId: '', tenantSlug: headerTenantSlug },
        () => next(),
      );
    }

    return TenantContext.run(
      {
        tenantId,
        tenantSlug: user?.tenantSlug ?? headerTenantSlug,
        accountId: user?.accountId,
        membershipId: user?.membershipId,
        roles: user?.roles,
      },
      () => next(),
    );
  }
}

export function assertTenantId(tenantId?: string): string {
  if (!tenantId) {
    throw new UnauthorizedException('tenant context required');
  }
  return tenantId;
}
