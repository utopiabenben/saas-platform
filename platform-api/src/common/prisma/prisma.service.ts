import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    // Soft connect: allow boot without DB during scaffolding / CI without Postgres.
    try {
      await this.$connect();
    } catch (err) {
      console.warn(
        '[Prisma] database not available yet — API boots in degraded mode:',
        (err as Error).message,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
