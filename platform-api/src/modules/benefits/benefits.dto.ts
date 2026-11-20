import {
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StorefrontItemDto {
  @IsString()
  courseId!: string;

  @IsNumber()
  sort!: number;
}

export class UpdateStorefrontDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StorefrontItemDto)
  items!: StorefrontItemDto[];
}

export class OrderPaidEventDto {
  @IsString()
  externalOrderId!: string;

  @IsNumber()
  @Min(0)
  amountPaid!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  partnerCode?: string;

  @IsOptional()
  @IsString()
  partnerId?: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  appClientId?: string;

  @IsOptional()
  @IsString()
  paidAt?: string;

  @IsString()
  idempotencyKey!: string;
}

export class OrderRefundedEventDto {
  @IsString()
  externalOrderId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  refundAmount?: number;

  @IsString()
  idempotencyKey!: string;
}

export class EarnPointsDto {
  @IsString()
  membershipId!: string;

  @IsNumber()
  amount!: number;

  @IsString()
  reason!: string;

  @IsOptional()
  meta?: Record<string, unknown>;
}
