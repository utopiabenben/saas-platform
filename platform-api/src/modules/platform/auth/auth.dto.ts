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

  /** Join this tenant on register (slug). Optional for platform bootstrap. */
  @IsOptional()
  @IsString()
  tenantSlug?: string;
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

export class SwitchTenantDto {
  @IsString()
  tenantSlug!: string;
}
