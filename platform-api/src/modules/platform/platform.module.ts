import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';

@Module({
  imports: [AuthModule, TenantsModule],
  exports: [AuthModule, TenantsModule],
})
export class PlatformModule {}
