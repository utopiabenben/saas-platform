import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}

export class LoginDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  tenantSlug?: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class SwitchTenantDto {
  @IsString()
  tenantSlug!: string;
}
