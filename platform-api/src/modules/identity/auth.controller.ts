import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RefreshDto,
  RegisterDto,
  SwitchTenantDto,
} from './auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('auth/login')
  login(@Body() dto: LoginDto, @Req() req: { ip?: string }) {
    return this.auth.login(dto, req.ip);
  }

  @Post('auth/refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto);
  }

  @Post('auth/logout')
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('auth/switch-tenant')
  switchTenant(
    @Req() req: { user: { accountId: string } },
    @Body() dto: SwitchTenantDto,
  ) {
    return this.auth.switchTenant(req.user.accountId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('accounts/me')
  me(@Req() req: { user: { accountId: string } }) {
    return this.auth.me(req.user.accountId);
  }
}
