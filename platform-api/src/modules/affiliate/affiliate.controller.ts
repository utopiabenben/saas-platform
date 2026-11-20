import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { AffiliateService } from './affiliate.service';

@Controller()
export class AffiliateController {
  constructor(private readonly affiliate: AffiliateService) {}

  @Get('p/:code/storefront')
  storefront(
    @Param('code') code: string,
    @Query('tenant') tenant?: string,
  ) {
    if (!tenant) throw new UnauthorizedException('?tenant= slug required');
    return this.affiliate.getStorefront(tenant, code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('affiliate/me/activate')
  activate(@Req() req: { user: { tenantId?: string; membershipId?: string } }) {
    if (!req.user.tenantId || !req.user.membershipId) {
      throw new UnauthorizedException('tenant membership required');
    }
    return this.affiliate.activatePartner(
      req.user.tenantId,
      req.user.membershipId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Put('affiliate/me/storefront')
  updateStorefront(
    @Req() req: { user: { tenantId?: string; membershipId?: string } },
    @Body() body: { items: Array<{ courseId: string; sort: number }> },
  ) {
    if (!req.user.tenantId || !req.user.membershipId) {
      throw new UnauthorizedException('tenant membership required');
    }
    return this.affiliate.updateStorefront(
      req.user.tenantId,
      req.user.membershipId,
      body.items ?? [],
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('affiliate/me/commissions')
  commissions(
    @Req() req: { user: { tenantId?: string; membershipId?: string } },
  ) {
    if (!req.user.tenantId || !req.user.membershipId) {
      throw new UnauthorizedException('tenant membership required');
    }
    return this.affiliate.listCommissions(
      req.user.tenantId,
      req.user.membershipId,
    );
  }
}
