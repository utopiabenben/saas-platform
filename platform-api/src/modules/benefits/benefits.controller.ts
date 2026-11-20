import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../platform/auth/jwt-auth.guard';
import {
  EarnPointsDto,
  OrderPaidEventDto,
  OrderRefundedEventDto,
  UpdateStorefrontDto,
} from './benefits.dto';
import { CommissionService } from './commission.service';
import { PartnerService } from './partner.service';
import { PointsService } from './points.service';

@Controller()
export class BenefitsController {
  constructor(
    private readonly partners: PartnerService,
    private readonly commissions: CommissionService,
    private readonly points: PointsService,
  ) {}

  @Get('p/:code/storefront')
  storefront(
    @Param('code') code: string,
    @Query('tenant') tenantSlug: string,
    @Headers('x-tenant-slug') headerSlug?: string,
  ) {
    const slug = tenantSlug || headerSlug;
    if (!slug) {
      throw new UnauthorizedException('tenant slug required (?tenant= or X-Tenant-Slug)');
    }
    return this.partners.getPublicStorefront(slug, code);
  }

  @UseGuards(JwtAuthGuard)
  @Put('partner/me/storefront')
  updateStorefront(
    @Req() req: { user: { tenantId: string; membershipId: string } },
    @Body() dto: UpdateStorefrontDto,
  ) {
    return this.partners.updateStorefront(
      req.user.tenantId,
      req.user.membershipId,
      dto,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('partner/me/commissions')
  myCommissions(
    @Req() req: { user: { tenantId: string; membershipId: string } },
  ) {
    return this.partners.listCommissions(
      req.user.tenantId,
      req.user.membershipId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('partner/me/statements')
  myStatements(
    @Req() req: { user: { tenantId: string; membershipId: string } },
  ) {
    return this.partners.listStatements(
      req.user.tenantId,
      req.user.membershipId,
    );
  }

  @Post('internal/events/order.paid')
  orderPaid(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: OrderPaidEventDto,
  ) {
    if (!tenantId) throw new UnauthorizedException('X-Tenant-Id required');
    return this.commissions.handleOrderPaid(tenantId, dto);
  }

  @Post('internal/events/order.refunded')
  orderRefunded(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: OrderRefundedEventDto,
  ) {
    if (!tenantId) throw new UnauthorizedException('X-Tenant-Id required');
    return this.commissions.handleOrderRefunded(tenantId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('points/me')
  myPoints(@Req() req: { user: { tenantId: string; membershipId: string } }) {
    return this.points.getMyPoints(req.user.tenantId, req.user.membershipId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('points/earn')
  earn(
    @Req() req: { user: { tenantId: string } },
    @Body() dto: EarnPointsDto,
  ) {
    return this.points.earn(req.user.tenantId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('rewards')
  rewards(@Req() req: { user: { tenantId: string } }) {
    return this.points.listRewards(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('rewards/:id/redeem')
  redeem(
    @Req() req: { user: { tenantId: string; membershipId: string } },
    @Param('id') id: string,
  ) {
    return this.points.redeem(
      req.user.tenantId,
      req.user.membershipId,
      id,
    );
  }
}
