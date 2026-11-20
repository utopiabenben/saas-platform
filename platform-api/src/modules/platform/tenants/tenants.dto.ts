import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  slug!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  plan?: string;

  /** Bootstrap admin account email for the new tenant */
  @IsOptional()
  @IsString()
  adminEmail?: string;

  @IsOptional()
  @IsString()
  adminPassword?: string;
}

export class UpdateMembershipRolesDto {
  @IsArray()
  @IsString({ each: true })
  roles!: string[];
}

export class CreateTenantAppDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  webhookUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];
}
