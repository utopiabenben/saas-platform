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
import { BillingService } from './billing.service';

@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('applications/:id/plans')
  plans(@Param('id') id: string) {
    return this.billing.listPlans(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('subscriptions')
  subscribe(
    @Req() req: { user: { tenantId?: string } },
    @Body() body: { tenantAppId: string; planId: string },
  ) {
    if (!req.user.tenantId) {
      throw new UnauthorizedException('tenant context required');
    }
    return this.billing.subscribeAndPay({
      tenantId: req.user.tenantId,
      tenantAppId: body.tenantAppId,
      planId: body.planId,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('subscriptions/:id')
  getSub(
    @Req() req: { user: { tenantId?: string } },
    @Param('id') id: string,
  ) {
    if (!req.user.tenantId) {
      throw new UnauthorizedException('tenant context required');
    }
    return this.billing.getSubscription(req.user.tenantId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('subscriptions/:id/change')
  change(
    @Req() req: { user: { tenantId?: string } },
    @Param('id') id: string,
    @Body() body: { toPlanId: string },
  ) {
    if (!req.user.tenantId) {
      throw new UnauthorizedException('tenant context required');
    }
    return this.billing.changeSubscription(
      req.user.tenantId,
      id,
      body.toPlanId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('subscriptions/:id/cancel')
  cancel(
    @Req() req: { user: { tenantId?: string } },
    @Param('id') id: string,
  ) {
    if (!req.user.tenantId) {
      throw new UnauthorizedException('tenant context required');
    }
    return this.billing.cancelSubscription(req.user.tenantId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('billing/orders')
  orders(@Req() req: { user: { tenantId?: string } }) {
    if (!req.user.tenantId) {
      throw new UnauthorizedException('tenant context required');
    }
    return this.billing.listOrders(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('billing/refunds')
  refund(
    @Req() req: { user: { tenantId?: string } },
    @Body() body: { orderId: string; amount?: number },
  ) {
    if (!req.user.tenantId) {
      throw new UnauthorizedException('tenant context required');
    }
    return this.billing.refundOrder(
      req.user.tenantId,
      body.orderId,
      body.amount,
    );
  }
}
