import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateTenantAppDto,
  CreateTenantDto,
  UpdateMembershipRolesDto,
} from './tenants.dto';
import { TenantsService } from './tenants.service';

@Controller()
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  /** Platform bootstrap: open a tenant (protect with platform admin later). */
  @Post('platform/tenants')
  create(@Body() dto: CreateTenantDto) {
    return this.tenants.createTenant(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tenants/me')
  me(@Req() req: { user: { tenantId: string } }) {
    return this.tenants.getTenantById(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tenants/me/memberships')
  memberships(@Req() req: { user: { tenantId: string } }) {
    return this.tenants.listMemberships(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('tenants/me/memberships/:id/roles')
  updateRoles(
    @Req() req: { user: { tenantId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateMembershipRolesDto,
  ) {
    return this.tenants.updateMembershipRoles(req.user.tenantId, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('tenants/me/apps')
  createApp(
    @Req() req: { user: { tenantId: string } },
    @Body() dto: CreateTenantAppDto,
  ) {
    return this.tenants.createApp(req.user.tenantId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('tenants/me/api-keys')
  createApiKey(
    @Req() req: { user: { tenantId: string } },
    @Body() body: { name: string; scopes?: string[] },
  ) {
    return this.tenants.createApiKey(
      req.user.tenantId,
      body.name ?? 'default',
      body.scopes ?? [],
    );
  }
}
