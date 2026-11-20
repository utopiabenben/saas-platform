import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EarnPointsDto } from './benefits.dto';

@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyPoints(tenantId: string, membershipId: string) {
    const account = await this.prisma.pointsAccount.findFirst({
      where: { tenantId, membershipId },
      include: {
        ledgers: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!account) throw new NotFoundException('points account not found');
    return account;
  }

  async earn(tenantId: string, dto: EarnPointsDto) {
    if (dto.amount === 0) {
      throw new BadRequestException('amount must be non-zero');
    }
    const account = await this.prisma.pointsAccount.findFirst({
      where: { tenantId, membershipId: dto.membershipId },
    });
    if (!account) throw new NotFoundException('points account not found');

    const [ledger] = await this.prisma.$transaction([
      this.prisma.pointsLedger.create({
        data: {
          tenantId,
          pointsAccountId: account.id,
          type: dto.amount > 0 ? 'earn' : 'adjust',
          amount: dto.amount,
          reason: dto.reason,
          meta: dto.meta as object | undefined,
        },
      }),
      this.prisma.pointsAccount.update({
        where: { id: account.id },
        data: { balanceCache: { increment: dto.amount } },
      }),
    ]);
    return ledger;
  }

  async redeem(
    tenantId: string,
    membershipId: string,
    rewardId: string,
  ) {
    const account = await this.prisma.pointsAccount.findFirst({
      where: { tenantId, membershipId },
    });
    if (!account) throw new NotFoundException('points account not found');

    const reward = await this.prisma.rewardCatalog.findFirst({
      where: { id: rewardId, tenantId, active: true },
    });
    if (!reward) throw new NotFoundException('reward not found');
    if (account.balanceCache < reward.pointsPrice) {
      throw new BadRequestException('insufficient points');
    }

    return this.prisma.$transaction(async (tx) => {
      const ledger = await tx.pointsLedger.create({
        data: {
          tenantId,
          pointsAccountId: account.id,
          type: 'redeem',
          amount: -reward.pointsPrice,
          reason: `redeem:${reward.sku}`,
        },
      });
      await tx.pointsAccount.update({
        where: { id: account.id },
        data: { balanceCache: { decrement: reward.pointsPrice } },
      });
      if (reward.stock != null) {
        await tx.rewardCatalog.update({
          where: { id: reward.id },
          data: { stock: { decrement: 1 } },
        });
      }
      const redemption = await tx.redemption.create({
        data: {
          tenantId,
          rewardId: reward.id,
          pointsLedgerId: ledger.id,
          fulfillStatus: reward.type === 'virtual' ? 'pending' : 'pending',
        },
      });
      return { ledger, redemption, reward };
    });
  }

  async listRewards(tenantId: string) {
    return this.prisma.rewardCatalog.findMany({
      where: { tenantId, active: true },
      orderBy: { pointsPrice: 'asc' },
    });
  }
}
