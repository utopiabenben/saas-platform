import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: {
    tenantId?: string;
    eventType: string;
    payload: Prisma.InputJsonValue;
  }) {
    return this.prisma.outboxEvent.create({
      data: {
        tenantId: input.tenantId,
        eventType: input.eventType,
        payload: input.payload,
        status: 'pending',
      },
    });
  }
}
