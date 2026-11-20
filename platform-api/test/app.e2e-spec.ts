import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

describe('Platform API V3 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.ok).toBe(true);
      });
  });

  it('TEN-001/002: dual tenant membership and cross-tenant deny', async () => {
    const email = `user_${Date.now()}@example.com`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'ChangeMe123', displayName: 'Dual' })
      .expect(201);

    const tokenA = reg.body.accessToken as string;
    const createA = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ slug: `t-a-${Date.now()}`, name: 'Tenant A' })
      .expect(201);

    // switch into A
    const loginA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email,
        password: 'ChangeMe123',
        tenantSlug: createA.body.slug,
      })
      .expect(201);

    const createB = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ slug: `t-b-${Date.now()}`, name: 'Tenant B' })
      .expect(201);

    const loginB = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email,
        password: 'ChangeMe123',
        tenantSlug: createB.body.slug,
      })
      .expect(201);

    const memberships = await prisma.membership.findMany({
      where: { accountId: reg.body.account.id },
    });
    expect(memberships.length).toBeGreaterThanOrEqual(2);

    // TEN-002: token for A cannot read B
    await request(app.getHttpServer())
      .get(`/api/v1/tenants/${createB.body.id}`)
      .set('Authorization', `Bearer ${loginA.body.accessToken}`)
      .expect(401);

    // B can read itself
    await request(app.getHttpServer())
      .get(`/api/v1/tenants/${createB.body.id}`)
      .set('Authorization', `Bearer ${loginB.body.accessToken}`)
      .expect(200);
  });

  it('APP-001: one tenant opens two applications', async () => {
    const email = `app_${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'ChangeMe123' })
      .expect(201);

    const login0 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'ChangeMe123' })
      .expect(201);

    const tenant = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .set('Authorization', `Bearer ${login0.body.accessToken}`)
      .send({ slug: `apps-${Date.now()}`, name: 'Apps Tenant' })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email,
        password: 'ChangeMe123',
        tenantSlug: tenant.body.slug,
      })
      .expect(201);

    const token = login.body.accessToken as string;
    const apps = await request(app.getHttpServer())
      .get('/api/v1/applications')
      .expect(200);
    expect(apps.body.length).toBeGreaterThanOrEqual(2);

    await request(app.getHttpServer())
      .post(`/api/v1/tenants/${tenant.body.id}/apps`)
      .set('Authorization', `Bearer ${token}`)
      .send({ applicationKey: 'ai-smart-english' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/tenants/${tenant.body.id}/apps`)
      .set('Authorization', `Bearer ${token}`)
      .send({ applicationKey: 'sharedao' })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/tenants/${tenant.body.id}/apps`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.length).toBe(2);
  });
});
