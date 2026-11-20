import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listApplications() {
    return this.prisma.application.findMany({
      where: { status: 'active' },
      orderBy: { name: 'asc' },
    });
  }

  async openTenantApp(
    tenantId: string,
    applicationKey: string,
    instanceKey = 'default',
  ) {
    const app = await this.prisma.application.findUnique({
      where: { applicationKey },
    });
    if (!app || app.status !== 'active') {
      throw new NotFoundException('application not found');
    }

    const existing = await this.prisma.tenantApp.findUnique({
      where: {
        tenantId_applicationId_instanceKey: {
          tenantId,
          applicationId: app.id,
          instanceKey,
        },
      },
    });
    if (existing) return existing;

    const rawSecret = randomBytes(24).toString('hex');
    return this.prisma.tenantApp.create({
      data: {
        tenantId,
        applicationId: app.id,
        instanceKey,
        status: 'active',
        secretHash: createHash('sha256').update(rawSecret).digest('hex'),
        webhookSecret: randomBytes(16).toString('hex'),
      },
    });
  }

  async listTenantApps(tenantId: string) {
    return this.prisma.tenantApp.findMany({
      where: { tenantId },
      include: { application: true },
    });
  }

  async rotateSecret(tenantId: string, tenantAppId: string) {
    const ta = await this.prisma.tenantApp.findFirst({
      where: { id: tenantAppId, tenantId },
    });
    if (!ta) throw new NotFoundException('tenant app not found');
    const rawSecret = randomBytes(24).toString('hex');
    await this.prisma.tenantApp.update({
      where: { id: tenantAppId },
      data: {
        secretHash: createHash('sha256').update(rawSecret).digest('hex'),
      },
    });
    return { id: tenantAppId, clientId: ta.clientId, clientSecret: rawSecret };
  }

  async createApiKey(tenantId: string, name: string, scopes: string[] = []) {
    if (!name) throw new BadRequestException('name required');
    const raw = `sk_${randomBytes(24).toString('hex')}`;
    const prefix = raw.slice(0, 10);
    const record = await this.prisma.apiKey.create({
      data: {
        tenantId,
        name,
        prefix,
        keyHash: createHash('sha256').update(raw).digest('hex'),
        scopes,
      },
    });
    return { id: record.id, prefix, apiKey: raw, scopes };
  }
}
