import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OutboxService } from '../../common/outbox/outbox.service';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  listPlans(applicationId: string) {
    return this.prisma.plan.findMany({
      where: { applicationId, status: 'active' },
      include: { features: { include: { feature: true } } },
      orderBy: { price: 'asc' },
    });
  }

  async createSubscription(input: {
    tenantId: string;
    tenantAppId: string;
    planId: string;
  }) {
    const plan = await this.prisma.plan.findUnique({
      where: { id: input.planId },
      include: { features: { include: { feature: true } } },
    });
    if (!plan) throw new NotFoundException('plan not found');

    const tenantApp = await this.prisma.tenantApp.findFirst({
      where: { id: input.tenantAppId, tenantId: input.tenantId },
    });
    if (!tenantApp) throw new NotFoundException('tenant app not found');

    const now = new Date();
    const periodEnd = new Date(now);
    if (plan.billingPeriod === 'yearly') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    const trialEndsAt =
      plan.trialDays > 0
        ? new Date(now.getTime() + plan.trialDays * 86400_000)
        : null;

    const order = await this.prisma.billingOrder.create({
      data: {
        tenantId: input.tenantId,
        orderType: 'SAAS_SUBSCRIPTION',
        status: 'pending',
        amountDue: plan.price,
        currency: plan.currency,
      },
    });

    const payment = await this.prisma.payment.create({
      data: {
        billingOrderId: order.id,
        provider: 'sandbox',
        amount: plan.price,
        currency: plan.currency,
        status: 'pending',
      },
    });

    // Sandbox auto-succeed
    return this.confirmPayment(input.tenantId, payment.id, {
      providerRef: `sandbox_${payment.id}`,
    });
  }

  async confirmPayment(
    tenantId: string,
    paymentId: string,
    body: { providerRef?: string },
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { billingOrder: true },
    });
    if (!payment || payment.billingOrder.tenantId !== tenantId) {
      throw new NotFoundException('payment not found');
    }
    if (payment.status === 'succeeded') {
      return { payment, idempotent: true };
    }

    const order = payment.billingOrder;
    // Find pending subscription creation context from meta or create now
    // For sandbox checkout we create subscription on first success.
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'succeeded',
          providerRef: body.providerRef ?? payment.providerRef,
        },
      });
      await tx.billingOrder.update({
        where: { id: order.id },
        data: {
          status: 'paid',
          amountPaid: order.amountDue,
        },
      });
      return updatedPayment;
    });

    return { payment: result, idempotent: false };
  }

  async subscribeAndPay(input: {
    tenantId: string;
    tenantAppId: string;
    planId: string;
  }) {
    const plan = await this.prisma.plan.findUnique({
      where: { id: input.planId },
      include: { features: { include: { feature: true } } },
    });
    if (!plan) throw new NotFoundException('plan not found');

    const tenantApp = await this.prisma.tenantApp.findFirst({
      where: { id: input.tenantAppId, tenantId: input.tenantId },
    });
    if (!tenantApp) throw new NotFoundException('tenant app not found');
    if (tenantApp.applicationId !== plan.applicationId) {
      throw new BadRequestException('plan does not belong to this application');
    }

    const now = new Date();
    const periodEnd = new Date(now);
    if (plan.billingPeriod === 'yearly') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }
    const trialEndsAt =
      plan.trialDays > 0
        ? new Date(now.getTime() + plan.trialDays * 86400_000)
        : null;
    const status = trialEndsAt ? 'trialing' : 'active';

    const { subscription, order, payment } = await this.prisma.$transaction(
      async (tx) => {
        const order = await tx.billingOrder.create({
          data: {
            tenantId: input.tenantId,
            orderType: 'SAAS_SUBSCRIPTION',
            status: 'paid',
            amountDue: plan.price,
            amountPaid: plan.price,
            currency: plan.currency,
          },
        });
        const payment = await tx.payment.create({
          data: {
            billingOrderId: order.id,
            provider: 'sandbox',
            providerRef: `sandbox_${order.id}`,
            amount: plan.price,
            currency: plan.currency,
            status: 'succeeded',
          },
        });
        const subscription = await tx.subscription.create({
          data: {
            tenantId: input.tenantId,
            tenantAppId: input.tenantAppId,
            planId: plan.id,
            status,
            priceSnapshot: plan.price,
            currency: plan.currency,
            billingPeriod: plan.billingPeriod,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            trialEndsAt,
          },
        });
        await tx.billingOrder.update({
          where: { id: order.id },
          data: { subscriptionId: subscription.id },
        });

        for (const pf of plan.features) {
          await tx.entitlement.create({
            data: {
              tenantId: input.tenantId,
              subscriptionId: subscription.id,
              code: pf.feature.code,
              value: {
                boolValue: pf.boolValue,
                limitValue: pf.limitValue,
              } as Prisma.InputJsonValue,
              endsAt: periodEnd,
            },
          });
        }

        // Seed usage credits from limit features
        for (const pf of plan.features) {
          if (pf.feature.valueType === 'limit' && pf.limitValue != null) {
            const account = await tx.usageAccount.upsert({
              where: {
                tenantId_metricCode: {
                  tenantId: input.tenantId,
                  metricCode: pf.feature.code,
                },
              },
              create: {
                tenantId: input.tenantId,
                metricCode: pf.feature.code,
                balanceCache: BigInt(pf.limitValue),
              },
              update: {
                balanceCache: { increment: BigInt(pf.limitValue) },
              },
            });
            await tx.usageLedger.create({
              data: {
                usageAccountId: account.id,
                direction: 'credit',
                amount: BigInt(pf.limitValue),
                reason: `plan:${plan.planCode}`,
                eventId: `sub_${subscription.id}_${pf.feature.code}`,
              },
            });
          }
        }

        return { subscription, order, payment };
      },
    );

    await this.outbox.enqueue({
      tenantId: input.tenantId,
      eventType: 'subscription.activated',
      payload: {
        subscriptionId: subscription.id,
        tenantAppId: input.tenantAppId,
        planId: plan.id,
        status: subscription.status,
      },
    });

    return { subscription, order, payment };
  }

  async changeSubscription(
    tenantId: string,
    subscriptionId: string,
    toPlanId: string,
  ) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, tenantId },
    });
    if (!sub) throw new NotFoundException('subscription not found');
    const toPlan = await this.prisma.plan.findUnique({ where: { id: toPlanId } });
    if (!toPlan) throw new NotFoundException('plan not found');

    const changeType =
      Number(toPlan.price) >= Number(sub.priceSnapshot) ? 'upgrade' : 'downgrade';
    const effectiveAt =
      changeType === 'upgrade' ? new Date() : sub.currentPeriodEnd;

    await this.prisma.subscriptionChange.create({
      data: {
        subscriptionId,
        fromPlanId: sub.planId,
        toPlanId,
        changeType,
        effectiveAt,
      },
    });

    if (changeType === 'upgrade') {
      const updated = await this.prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          planId: toPlanId,
          priceSnapshot: toPlan.price,
          billingPeriod: toPlan.billingPeriod,
          status: 'active',
        },
      });
      await this.outbox.enqueue({
        tenantId,
        eventType: 'subscription.changed',
        payload: { subscriptionId, changeType, toPlanId },
      });
      return updated;
    }

    return { ...sub, pendingDowngradeTo: toPlanId, effectiveAt };
  }

  async cancelSubscription(tenantId: string, subscriptionId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, tenantId },
    });
    if (!sub) throw new NotFoundException('subscription not found');
    return this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { cancelAtPeriodEnd: true, canceledAt: new Date() },
    });
  }

  async refundOrder(tenantId: string, orderId: string, amount?: number) {
    const order = await this.prisma.billingOrder.findFirst({
      where: { id: orderId, tenantId },
    });
    if (!order) throw new NotFoundException('order not found');
    if (order.status !== 'paid' && order.status !== 'partially_refunded') {
      throw new BadRequestException('order not refundable');
    }

    const refundAmount = amount ?? Number(order.amountPaid);
    const refund = await this.prisma.$transaction(async (tx) => {
      const r = await tx.refund.create({
        data: {
          billingOrderId: orderId,
          amount: new Prisma.Decimal(refundAmount),
          status: 'succeeded',
          reason: 'admin_refund',
        },
      });
      await tx.billingOrder.update({
        where: { id: orderId },
        data: {
          status:
            refundAmount >= Number(order.amountPaid)
              ? 'refunded'
              : 'partially_refunded',
        },
      });
      if (order.subscriptionId) {
        await tx.subscription.update({
          where: { id: order.subscriptionId },
          data: { status: 'canceled', canceledAt: new Date() },
        });
        await tx.entitlement.updateMany({
          where: { subscriptionId: order.subscriptionId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return r;
    });

    await this.outbox.enqueue({
      tenantId,
      eventType: 'entitlement.revoked',
      payload: { orderId, refundId: refund.id },
    });

    return refund;
  }

  getSubscription(tenantId: string, id: string) {
    return this.prisma.subscription.findFirst({
      where: { id, tenantId },
      include: { plan: true, entitlements: true },
    });
  }

  listOrders(tenantId: string) {
    return this.prisma.billingOrder.findMany({
      where: { tenantId },
      include: { payments: true, refunds: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
