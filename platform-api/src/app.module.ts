import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { TenantMiddleware } from './common/tenant/tenant.middleware';
import { AffiliateModule } from './modules/affiliate/affiliate.module';
import { BillingModule } from './modules/billing/billing.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ChannelModule } from './modules/channel/channel.module';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { TenantModule } from './modules/tenant/tenant.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    IdentityModule,
    TenantModule,
    RbacModule,
    CatalogModule,
    BillingModule,
    LedgerModule,
    AffiliateModule,
    ChannelModule,
    EventsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('{*path}');
  }
}
