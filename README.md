# SaaS Platform

可私有部署的 **统一运营与分销管理中台**：身份/租户、应用目录、订阅计费、多账本权益、用量计量、双线分销。

初始接入产品：ShareDAO、AI Smart 儿童英语、Digital Store、CertReport。

## 架构（V3.0）

```text
Platform Monolith
  Identity · Tenant · RBAC · Application/TenantApp
  Plan · Subscription · Billing
  Wallet / Points / Usage / Entitlement（分账本）
  ChannelPartner · AffiliatePartner · Settlement
  Event Gateway（Inbox/Outbox）
        │
Tenant Apps ── SSO + usage/order events ──► Platform
```

文档入口：[`docs/`](./docs/)（现行基准标签 `docs-v3.0`）。

## 仓库结构

```text
saas-platform/
  docker-compose.yml      # Postgres + Redis
  docs/                   # V3.0 方案与需求
  platform-api/           # NestJS 中台 API（/api/v1）
```

## 快速开始

### 1. 启动依赖

```bash
docker compose up -d
```

### 2. 配置、迁移与种子

```bash
cd platform-api
cp .env.example .env
npm install
npx prisma migrate dev --name v3_init
npm run prisma:seed
npm run start:dev
```

默认 API：`http://localhost:3100/api/v1`  
健康检查：`GET /api/v1/health`  
种子账号：`admin-a@example.com` / `ChangeMe123`，租户 `demo-a`

### 3. 登录演示租户

```bash
curl -X POST http://localhost:3100/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "admin-a@example.com",
    "password": "ChangeMe123",
    "tenantSlug": "demo-a"
  }'
```

## 身份模型（务必分清）

| 概念 | 说明 |
|------|------|
| **Tenant** | 客户隔离边界，业务数据必带 `tenantId` |
| **Account** | 全局登录身份 |
| **Membership** | 账号在某租户的席位 + 角色 |
| **Partner / EndUser** | Membership 角色，不是两套登录 |

## 技术栈

- NestJS 11 + TypeScript
- PostgreSQL + Prisma
- Redis（队列预留，BullMQ 后续）
- JWT 鉴权（租户上下文）

## 分期

- **P0**：租户/账号可登录 + 分销月结算清
- **P1**：积分兑换 + 履约 Webhook
- **P2**：多租户可售卖（开租户、API Key、第二款 App）

## License

UNLICENSED（私有）
