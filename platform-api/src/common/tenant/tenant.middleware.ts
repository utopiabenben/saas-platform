import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TenantContext } from './tenant.context';

type AuthedRequest = Request & {
  user?: {
    accountId?: string;
    tenantId?: string;
    tenantSlug?: string;
    membershipId?: string;
    roleCodes?: string[];
    sessionId?: string;
  };
};

/**
 * Tenant context comes ONLY from verified JWT/session (req.user).
 * Never trust tenantId from request body.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: AuthedRequest, _res: Response, next: NextFunction) {
    const user = req.user;
    if (!user?.accountId && !user?.tenantId) {
      return next();
    }
    return TenantContext.run(
      {
        accountId: user.accountId,
        tenantId: user.tenantId,
        tenantSlug: user.tenantSlug,
        membershipId: user.membershipId,
        roleCodes: user.roleCodes,
        sessionId: user.sessionId,
      },
      () => next(),
    );
  }
}
