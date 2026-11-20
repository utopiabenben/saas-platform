import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ChannelService } from './channel.service';

@Controller()
export class ChannelController {
  constructor(private readonly channels: ChannelService) {}

  @UseGuards(JwtAuthGuard)
  @Post('channels')
  create(
    @Req() req: { user: { accountId: string } },
    @Body() body: { name: string; region?: string },
  ) {
    return this.channels.createChannel({
      name: body.name,
      region: body.region,
      ownerAccountId: req.user.accountId,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('channels/me')
  mine(@Req() req: { user: { accountId: string } }) {
    return this.channels.myChannels(req.user.accountId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('channels/:id/leads')
  createLead(
    @Param('id') id: string,
    @Body() body: { companyName?: string; contactEmail?: string },
  ) {
    return this.channels.createLead(id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('channels/:id/leads')
  leads(@Param('id') id: string) {
    return this.channels.listLeads(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('channels/:id/referrals')
  refer(
    @Param('id') id: string,
    @Body() body: { tenantId: string; leadId?: string },
  ) {
    return this.channels.attachTenant(id, body.tenantId, body.leadId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('channels/:id/commissions')
  commissions(@Param('id') id: string) {
    return this.channels.listCommissions(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('channels/:id/commissions')
  recordCommission(
    @Param('id') id: string,
    @Body()
    body: {
      tenantId: string;
      orderId: string;
      amountPaid: number;
      kind?: 'new' | 'renewal';
    },
  ) {
    return this.channels.recordSubscriptionCommission({
      channelId: id,
      tenantId: body.tenantId,
      orderId: body.orderId,
      amountPaid: body.amountPaid,
      kind: body.kind ?? 'new',
    });
  }
}
