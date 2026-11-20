import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      ok: true,
      service: 'platform-api',
      version: '0.3.0',
      ts: new Date().toISOString(),
    };
  }
}
