# SaaS Platform

可私有部署的 **SaaS 底座**：多租户身份内核 + 可开关的权益模块（分销提成 / 月结 / 分享积分）。

首个业务应用对接目标：AI Smart 儿童英语（`ai-smart-english`）。

## 架构

```text
Platform Kernel     Tenant · Account · Membership · RBAC · Audit · Config
        │
Benefits Module     Partner · Commission · Settlement · Points · Rewards
        │
Tenant Apps         ai-smart-english（及其他未来产品）via SSO + 订单事件
```

文档入口：[`docs/`](./docs/)（需求 + 完整方案，标签 `docs-v2.0`）。

## 仓库结构

```text
saas-platform/
  docker-compose.yml      # Postgres + Redis
  docs/                   # 产品/架构方案
  platform-api/           # NestJS API（Kernel + Benefits）
```

## 快速开始

### 1. 启动依赖

```bash
docker compose up -d
```

### 2. 配置并迁移

```bash
cd platform-api
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run start:dev
```

默认 API：`http://localhost:3100/api`  
健康检查：`GET /api/health`

### 3. 开第一个租户

```bash
curl -X POST http://localhost:3100/api/platform/tenants \
  -H 'Content-Type: application/json' \
  -d '{
    "slug": "ai-smart-english",
    "name": "AI Smart 儿童英语",
    "adminEmail": "admin@example.com",
    "adminPassword": "ChangeMe123"
  }'
```

### 4. 登录

```bash
curl -X POST http://localhost:3100/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "admin@example.com",
    "password": "ChangeMe123",
    "tenantSlug": "ai-smart-english"
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
