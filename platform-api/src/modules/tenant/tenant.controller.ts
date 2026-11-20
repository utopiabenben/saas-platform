import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import {
  AcceptInvitationDto,
  CreateTenantDto,
  InviteMemberDto,
  UpdateMembershipRolesDto,
} from './tenant.dto';
import { TenantService } from './tenant.service';

@Controller()
export class TenantController {
  constructor(private readonly tenants: TenantService) {}

  @UseGuards(JwtAuthGuard)
  @Post('platform/tenants')
  create(
    @Req() req: { user: { accountId: string } },
    @Body() dto: CreateTenantDto,
  ) {
    return this.tenants.createTenant(dto, req.user.accountId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tenants/me')
  me(@Req() req: { user: { tenantId?: string } }) {
    if (!req.user.tenantId) {
      throw new UnauthorizedException('tenant context required');
    }
    return this.tenants.getTenant(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tenants/:id')
  getOne(
    @Req() req: { user: { tenantId?: string } },
    @Param('id') id: string,
  ) {
    this.tenants.assertTenantAccess(req.user.tenantId, id);
    return this.tenants.getTenant(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tenants/:id/members')
  members(
    @Req() req: { user: { tenantId?: string } },
    @Param('id') id: string,
  ) {
    this.tenants.assertTenantAccess(req.user.tenantId, id);
    return this.tenants.listMembers(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('tenants/:id/invitations')
  invite(
    @Req() req: { user: { accountId: string; tenantId?: string } },
    @Param('id') id: string,
    @Body() dto: InviteMemberDto,
  ) {
    this.tenants.assertTenantAccess(req.user.tenantId, id);
    return this.tenants.invite(id, req.user.accountId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('invitations/accept')
  accept(
    @Req() req: { user: { accountId: string } },
    @Body() dto: AcceptInvitationDto,
  ) {
    return this.tenants.acceptInvitation(req.user.accountId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('memberships/:id/roles')
  updateRoles(
    @Req() req: { user: { tenantId?: string } },
    @Param('id') id: string,
    @Body() dto: UpdateMembershipRolesDto,
  ) {
    if (!req.user.tenantId) {
      throw new UnauthorizedException('tenant context required');
    }
    return this.tenants.updateRoles(req.user.tenantId, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('memberships/:id/disable')
  disable(
    @Req() req: { user: { accountId: string; tenantId?: string } },
    @Param('id') id: string,
  ) {
    if (!req.user.tenantId) {
      throw new UnauthorizedException('tenant context required');
    }
    return this.tenants.disableMembership(
      req.user.tenantId,
      id,
      req.user.accountId,
    );
  }
}
