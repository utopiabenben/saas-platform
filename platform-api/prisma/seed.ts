import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const APPS = [
  {
    applicationKey: 'sharedao',
    name: 'ShareDAO',
    description: '内容与协作平台',
  },
  {
    applicationKey: 'ai-smart-english',
    name: 'AI Smart 儿童英语',
    description: '儿童英语成长工作台',
  },
  {
    applicationKey: 'digital-store',
    name: 'Digital Store',
    description: '数字商品商店',
  },
  {
    applicationKey: 'cert-report',
    name: 'CertReport AI',
    description: '出口认证平台',
  },
];

async function main() {
  for (const app of APPS) {
    await prisma.application.upsert({
      where: { applicationKey: app.applicationKey },
      create: { ...app, status: 'active', selfServe: true },
      update: { name: app.name, description: app.description },
    });
  }

  const permissions = [
    'tenant.member.invite',
    'tenant.member.manage',
    'billing.subscription.manage',
    'billing.checkout',
    'wallet.points.adjust',
    'app.manage',
    'channel.manage',
    'affiliate.manage',
  ];
  for (const code of permissions) {
    await prisma.permission.upsert({
      where: { code },
      create: { code, description: code },
      update: {},
    });
  }

  const english = await prisma.application.findUniqueOrThrow({
    where: { applicationKey: 'ai-smart-english' },
  });

  const featureSeat = await prisma.feature.upsert({
    where: { code: 'seats' },
    create: { code: 'seats', name: '成员席位', valueType: 'limit' },
    update: {},
  });
  const featureTokens = await prisma.feature.upsert({
    where: { code: 'ai.tokens' },
    create: { code: 'ai.tokens', name: 'AI Token 额度', valueType: 'limit' },
    update: {},
  });
  const featureLearning = await prisma.feature.upsert({
    where: { code: 'learning.basic' },
    create: {
      code: 'learning.basic',
      name: '基础学习功能',
      valueType: 'boolean',
    },
    update: {},
  });

  const starter = await prisma.plan.upsert({
    where: {
      applicationId_planCode_version: {
        applicationId: english.id,
        planCode: 'starter',
        version: 1,
      },
    },
    create: {
      applicationId: english.id,
      planCode: 'starter',
      name: 'Starter',
      version: 1,
      billingPeriod: 'monthly',
      price: new Prisma.Decimal('99.00'),
      currency: 'CNY',
      trialDays: 7,
      seatLimit: 5,
      features: {
        create: [
          { featureId: featureSeat.id, limitValue: 5 },
          { featureId: featureTokens.id, limitValue: 100000 },
          { featureId: featureLearning.id, boolValue: true },
        ],
      },
    },
    update: {},
  });

  const pro = await prisma.plan.upsert({
    where: {
      applicationId_planCode_version: {
        applicationId: english.id,
        planCode: 'pro',
        version: 1,
      },
    },
    create: {
      applicationId: english.id,
      planCode: 'pro',
      name: 'Pro',
      version: 1,
      billingPeriod: 'monthly',
      price: new Prisma.Decimal('299.00'),
      currency: 'CNY',
      trialDays: 0,
      seatLimit: 20,
      features: {
        create: [
          { featureId: featureSeat.id, limitValue: 20 },
          { featureId: featureTokens.id, limitValue: 1000000 },
          { featureId: featureLearning.id, boolValue: true },
        ],
      },
    },
    update: {},
  });

  const passwordHash = await bcrypt.hash('ChangeMe123', 10);

  async function ensureDemoTenant(slug: string, name: string, email: string) {
    let tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          slug,
          name,
          status: 'active',
          profile: { create: {} },
        },
      });
    }

    for (const code of [
      'tenant_owner',
      'tenant_admin',
      'billing_admin',
      'member_admin',
      'operator',
      'member',
      'readonly',
    ]) {
      await prisma.role.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code } },
        create: { tenantId: tenant.id, code, name: code, scope: 'tenant' },
        update: {},
      });
    }

    let identity = await prisma.accountIdentity.findUnique({
      where: {
        provider_identifier: {
          provider: 'password_email',
          identifier: email,
        },
      },
      include: { account: true },
    });
    if (!identity) {
      const account = await prisma.account.create({
        data: {
          displayName: `${name} Admin`,
          identities: {
            create: {
              provider: 'password_email',
              identifier: email,
              verifiedAt: new Date(),
              credentialRef: passwordHash,
            },
          },
        },
      });
      identity = await prisma.accountIdentity.findFirstOrThrow({
        where: { accountId: account.id },
        include: { account: true },
      });
    }

    const membership = await prisma.membership.upsert({
      where: {
        tenantId_accountId: {
          tenantId: tenant.id,
          accountId: identity.accountId,
        },
      },
      create: {
        tenantId: tenant.id,
        accountId: identity.accountId,
        status: 'active',
      },
      update: { status: 'active' },
    });

    const ownerRole = await prisma.role.findUniqueOrThrow({
      where: {
        tenantId_code: { tenantId: tenant.id, code: 'tenant_owner' },
      },
    });
    await prisma.membershipRole.upsert({
      where: {
        membershipId_roleId: {
          membershipId: membership.id,
          roleId: ownerRole.id,
        },
      },
      create: { membershipId: membership.id, roleId: ownerRole.id },
      update: {},
    });

    await prisma.pointsAccount.upsert({
      where: { membershipId: membership.id },
      create: { tenantId: tenant.id, membershipId: membership.id },
      update: {},
    });

    await prisma.rewardCatalog.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku: 'trial_7d' } },
      create: {
        tenantId: tenant.id,
        sku: 'trial_7d',
        name: '7天体验',
        pointsPrice: 100,
        type: 'virtual',
        active: true,
      },
      update: {},
    });

    const tenantApp = await prisma.tenantApp.upsert({
      where: {
        tenantId_applicationId_instanceKey: {
          tenantId: tenant.id,
          applicationId: english.id,
          instanceKey: 'default',
        },
      },
      create: {
        tenantId: tenant.id,
        applicationId: english.id,
        instanceKey: 'default',
        status: 'active',
      },
      update: {},
    });

    return { tenant, membership, tenantApp, email };
  }

  const demoA = await ensureDemoTenant(
    'demo-a',
    '演示租户 A',
    'admin-a@example.com',
  );
  const demoB = await ensureDemoTenant(
    'demo-b',
    '演示租户 B',
    'admin-b@example.com',
  );

  console.log(
    JSON.stringify(
      {
        apps: APPS.map((a) => a.applicationKey),
        plans: [starter.planCode, pro.planCode],
        tenants: [
          { slug: demoA.tenant.slug, email: demoA.email },
          { slug: demoB.tenant.slug, email: demoB.email },
        ],
        password: 'ChangeMe123',
        note: 'Login with tenantSlug demo-a or demo-b',
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
