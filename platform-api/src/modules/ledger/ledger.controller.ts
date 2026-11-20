import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { LedgerService } from './ledger.service';

@Controller()
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @UseGuards(JwtAuthGuard)
  @Get('points/me')
  myPoints(
    @Req() req: { user: { tenantId?: string; membershipId?: string } },
  ) {
    if (!req.user.tenantId || !req.user.membershipId) {
      throw new UnauthorizedException('tenant membership required');
    }
    return this.ledger.getPoints(req.user.tenantId, req.user.membershipId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('points/earn')
  earn(
    @Req() req: { user: { tenantId?: string } },
    @Body()
    body: {
      membershipId: string;
      amount: number;
      reason: string;
      eventId?: string;
    },
  ) {
    if (!req.user.tenantId) {
      throw new UnauthorizedException('tenant context required');
    }
    return this.ledger.earnPoints({
      tenantId: req.user.tenantId,
      membershipId: body.membershipId,
      amount: body.amount,
      reason: body.reason,
      eventId: body.eventId,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('rewards')
  rewards(@Req() req: { user: { tenantId?: string } }) {
    if (!req.user.tenantId) {
      throw new UnauthorizedException('tenant context required');
    }
    return this.ledger.listRewards(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('rewards/:id/redeem')
  redeem(
    @Req() req: { user: { tenantId?: string; membershipId?: string } },
    @Param('id') id: string,
  ) {
    if (!req.user.tenantId || !req.user.membershipId) {
      throw new UnauthorizedException('tenant membership required');
    }
    return this.ledger.redeem(
      req.user.tenantId,
      req.user.membershipId,
      id,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('tenants/:id/usage')
  usage(
    @Req() req: { user: { tenantId?: string } },
    @Param('id') id: string,
  ) {
    if (req.user.tenantId !== id) {
      throw new UnauthorizedException('cross-tenant access denied');
    }
    return this.ledger.usageSummary(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('entitlements/me')
  entitlements(@Req() req: { user: { tenantId?: string } }) {
    if (!req.user.tenantId) {
      throw new UnauthorizedException('tenant context required');
    }
    return this.ledger.listEntitlements(req.user.tenantId);
  }
}
