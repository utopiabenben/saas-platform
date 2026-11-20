/**
 * P0–P2 acceptance smoke against a live Nest app (no Jest ESM issues).
 * Usage: npx ts-node --transpile-only scripts/acceptance-v3.ts
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

async function req(
  base: string,
  method: string,
  path: string,
  body?: unknown,
  token?: string,
) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  (BigInt.prototype as unknown as { toJSON?: () => string }).toJSON = function () {
    return this.toString();
  };

  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  await app.listen(0);
  const server = app.getHttpServer();
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 3100;
  const base = `http://127.0.0.1:${port}`;
  const prisma = app.get(PrismaService);

  console.log('health…');
  const health = await req(base, 'GET', '/api/v1/health');
  assert(health.status === 200 && health.body.ok, 'health failed');

  // TEN-001 / TEN-002
  console.log('TEN-001/002…');
  const email = `acc_${Date.now()}@example.com`;
  const reg = await req(base, 'POST', '/api/v1/auth/register', {
    email,
    password: 'ChangeMe123',
    displayName: 'Acc',
  });
  assert(reg.status < 300, `register failed: ${reg.status}`);
  const token0 = reg.body.accessToken as string;

  const tA = await req(
    base,
    'POST',
    '/api/v1/platform/tenants',
    { slug: `ta-${Date.now()}`, name: 'Tenant A' },
    token0,
  );
  assert(tA.status < 300, `create A failed: ${JSON.stringify(tA.body)}`);
  const loginA = await req(base, 'POST', '/api/v1/auth/login', {
    email,
    password: 'ChangeMe123',
    tenantSlug: tA.body.slug,
  });
  assert(loginA.status < 300, 'login A failed');

  const tB = await req(
    base,
    'POST',
    '/api/v1/platform/tenants',
    { slug: `tb-${Date.now()}`, name: 'Tenant B' },
    token0,
  );
  assert(tB.status < 300, 'create B failed');
  const loginB = await req(base, 'POST', '/api/v1/auth/login', {
    email,
    password: 'ChangeMe123',
    tenantSlug: tB.body.slug,
  });
  assert(loginB.status < 300, 'login B failed');

  const memberships = await prisma.membership.count({
    where: { accountId: reg.body.account.id },
  });
  assert(memberships >= 2, 'TEN-001 expected 2 memberships');

  const cross = await req(
    base,
    'GET',
    `/api/v1/tenants/${tB.body.id}`,
    undefined,
    loginA.body.accessToken,
  );
  assert(cross.status === 401, 'TEN-002 expected 401');

  // APP-001
  console.log('APP-001…');
  const apps = await req(base, 'GET', '/api/v1/applications');
  assert(apps.body.length >= 2, 'need seeded applications');
  const open1 = await req(
    base,
    'POST',
    `/api/v1/tenants/${tA.body.id}/apps`,
    { applicationKey: 'ai-smart-english' },
    loginA.body.accessToken,
  );
  assert(open1.status < 300, `open english failed ${JSON.stringify(open1.body)}`);
  const open2 = await req(
    base,
    'POST',
    `/api/v1/tenants/${tA.body.id}/apps`,
    { applicationKey: 'sharedao' },
    loginA.body.accessToken,
  );
  assert(open2.status < 300, 'open sharedao failed');
  const listApps = await req(
    base,
    'GET',
    `/api/v1/tenants/${tA.body.id}/apps`,
    undefined,
    loginA.body.accessToken,
  );
  assert(listApps.body.length === 2, 'APP-001 expected 2 tenant apps');

  // SUB-001 sandbox subscribe
  console.log('SUB-001…');
  const english = await prisma.application.findUniqueOrThrow({
    where: { applicationKey: 'ai-smart-english' },
  });
  const plan = await prisma.plan.findFirstOrThrow({
    where: { applicationId: english.id, planCode: 'starter' },
  });
  const sub = await req(
    base,
    'POST',
    '/api/v1/subscriptions',
    { tenantAppId: open1.body.id, planId: plan.id },
    loginA.body.accessToken,
  );
  assert(sub.status < 300, `subscribe failed ${JSON.stringify(sub.body)}`);
  assert(sub.body.subscription?.id, 'subscription missing');

  // USG-001 idempotent usage
  console.log('USG-001…');
  const key = `usage_${Date.now()}`;
  const u1r = await fetch(`${base}/api/v1/internal/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': tA.body.id,
    },
    body: JSON.stringify({
      eventType: 'usage.recorded',
      idempotencyKey: key,
      payload: { metricCode: 'ai.tokens', quantity: 10 },
    }),
  });
  const u1b = await u1r.json();
  assert(u1r.status < 300, `usage1 failed ${JSON.stringify(u1b)}`);
  const u2r = await fetch(`${base}/api/v1/internal/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': tA.body.id,
    },
    body: JSON.stringify({
      eventType: 'usage.recorded',
      idempotencyKey: key,
      payload: { metricCode: 'ai.tokens', quantity: 10 },
    }),
  });
  const u2b = await u2r.json();
  assert(u2b.idempotent === true, 'USG-001 expected idempotent');

  // AFF-001
  console.log('AFF-001…');
  const aff = await req(
    base,
    'POST',
    '/api/v1/affiliate/me/activate',
    {},
    loginA.body.accessToken,
  );
  assert(aff.status < 300, `affiliate activate failed ${JSON.stringify(aff.body)}`);
  const orderPaid = await fetch(`${base}/api/v1/internal/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': tA.body.id,
    },
    body: JSON.stringify({
      eventType: 'order.paid',
      idempotencyKey: `ord_${Date.now()}`,
      payload: {
        externalOrderId: `biz_${Date.now()}`,
        amountPaid: 100,
        partnerCode: aff.body.inviteCode,
      },
    }),
  });
  const orderBody = await orderPaid.json();
  assert(orderPaid.status < 300, `order.paid failed ${JSON.stringify(orderBody)}`);
  assert(orderBody.result?.commission, 'AFF-001 expected commission');

  // CHN-001
  console.log('CHN-001…');
  const ch = await req(
    base,
    'POST',
    '/api/v1/channels',
    { name: 'Demo Channel', region: 'CN' },
    loginA.body.accessToken,
  );
  assert(ch.status < 300, `channel create failed ${JSON.stringify(ch.body)}`);
  const lead = await req(
    base,
    'POST',
    `/api/v1/channels/${ch.body.id}/leads`,
    { companyName: 'Lead Co', contactEmail: 'lead@example.com' },
    loginA.body.accessToken,
  );
  assert(lead.status < 300, 'lead failed');
  const ref = await req(
    base,
    'POST',
    `/api/v1/channels/${ch.body.id}/referrals`,
    { tenantId: tB.body.id, leadId: lead.body.id },
    loginA.body.accessToken,
  );
  assert(ref.status < 300, `referral failed ${JSON.stringify(ref.body)}`);
  const comm = await req(
    base,
    'POST',
    `/api/v1/channels/${ch.body.id}/commissions`,
    {
      tenantId: tB.body.id,
      orderId: sub.body.order.id,
      amountPaid: 99,
      kind: 'new',
    },
    loginA.body.accessToken,
  );
  assert(comm.status < 300, `channel commission failed ${JSON.stringify(comm.body)}`);

  console.log('ALL ACCEPTANCE CHECKS PASSED');
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
