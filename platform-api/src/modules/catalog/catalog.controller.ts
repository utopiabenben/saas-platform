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
import { CatalogService } from './catalog.service';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('applications')
  listApps() {
    return this.catalog.listApplications();
  }

  @UseGuards(JwtAuthGuard)
  @Get('tenants/:id/apps')
  listTenantApps(
    @Req() req: { user: { tenantId?: string } },
    @Param('id') id: string,
  ) {
    if (req.user.tenantId !== id) {
      throw new UnauthorizedException('cross-tenant access denied');
    }
    return this.catalog.listTenantApps(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('tenants/:id/apps')
  openApp(
    @Req() req: { user: { tenantId?: string } },
    @Param('id') id: string,
    @Body() body: { applicationKey: string; instanceKey?: string },
  ) {
    if (req.user.tenantId !== id) {
      throw new UnauthorizedException('cross-tenant access denied');
    }
    return this.catalog.openTenantApp(
      id,
      body.applicationKey,
      body.instanceKey ?? 'default',
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('tenant-apps/:id/rotate-secret')
  rotate(
    @Req() req: { user: { tenantId?: string } },
    @Param('id') id: string,
  ) {
    if (!req.user.tenantId) {
      throw new UnauthorizedException('tenant context required');
    }
    return this.catalog.rotateSecret(req.user.tenantId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('tenants/:id/api-keys')
  createKey(
    @Req() req: { user: { tenantId?: string } },
    @Param('id') id: string,
    @Body() body: { name: string; scopes?: string[] },
  ) {
    if (req.user.tenantId !== id) {
      throw new UnauthorizedException('cross-tenant access denied');
    }
    return this.catalog.createApiKey(id, body.name, body.scopes ?? []);
  }
}
