import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    tenantId?: string;
    actorAccountId?: string;
    action: string;
    resource: string;
    meta?: Prisma.InputJsonValue;
    ip?: string;
    requestId?: string;
  }) {
    return this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorAccountId: input.actorAccountId,
        action: input.action,
        resource: input.resource,
        meta: input.meta,
        ip: input.ip,
        requestId: input.requestId,
      },
    });
  }
}
