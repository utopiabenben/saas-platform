import { Module } from '@nestjs/common';

/** RBAC tables live in Prisma; seed assigns roles. Extension point for guards. */
@Module({})
export class RbacModule {}
