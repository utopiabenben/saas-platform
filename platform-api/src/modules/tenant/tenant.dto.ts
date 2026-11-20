import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  slug!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsArray()
  @IsString({ each: true })
  roleCodes!: string[];
}

export class AcceptInvitationDto {
  @IsString()
  token!: string;
}

export class UpdateMembershipRolesDto {
  @IsArray()
  @IsString({ each: true })
  roleCodes!: string[];
}
