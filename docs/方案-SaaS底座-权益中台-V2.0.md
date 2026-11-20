# 权益中台方案｜SaaS 底座 · 分销提成 · 分享积分

> 原则：**逻辑复用成熟开源，技术栈现代化重写；先立平台主数据，再挂业务模块**  
> 对照来源：CRMEB / DSKms（分销+积分）、Laravel Affiliate（月结）、OfferKit（积分账本）  
> 首个业务租户应用：AI Smart 儿童英语（`ai-smart-english`）  
> 日期：2026-11-20 · 版本 **V2.0（SaaS 底座补齐）** · 文档标签 **`docs-v2.0`**  
> 需求摘要：[`01-需求简述.md`](./01-需求简述.md)  
> 变更：在 V1.0 权益旁路之上，补齐 **Tenant / Account / Membership / Subject** 与商业事件契约，使本仓可独立作为可私有部署的 SaaS 底座。

---

## 0. 一句话结论

**底座管「谁、属于哪家、什么角色」；权益模块管「怎么归因、怎么分钱、怎么积分兑换」。**  
首版用 NestJS + PostgreSQL 落地平台内核 + 分销积分模块；儿童英语作为第一个 **App 租户应用**，经 SSO + 订单事件总线接入，不污染 L 等级学习主线。

---

## 1. 定位：底座 vs 模块 vs 业务应用

```text
┌─────────────────────────────────────────────────────────┐
│  Platform Kernel（SaaS 底座，本仓自有）                   │
│  Tenant · Account · Membership · RBAC · Audit · Config  │
└───────────────────────────┬─────────────────────────────┘
                            │ 租户上下文 / 统一鉴权
┌───────────────────────────▼─────────────────────────────┐
│  Benefits Module（权益中台，可开关）                       │
│  Partner · Attribution · Commission · Settlement        │
│  Points · RewardCatalog · Redemption                    │
└───────────────────────────┬─────────────────────────────┘
                            │ SSO · Webhook/Outbox 订单事件
┌───────────────────────────▼─────────────────────────────┐
│  Tenant Apps（业务应用，可多产品）                         │
│  ① ai-smart-english（首个）  ② 未来其它课程/商城…         │
└─────────────────────────────────────────────────────────┘
```

| 层 | 职责 | 不做什么 |
|----|------|----------|
| **Platform Kernel** | 多租户、账号登录、成员角色、审计、租户配置、API Key/Webhook | 不关心佣金算法、学习明细 |
| **Benefits Module** | 归因、佣金账本、月结、积分流水、兑换履约 | 不自建用户主数据；不读儿童学习表 |
| **Tenant App** | 商品/课程、下单支付、学习主线 | 不实现月结/积分账本（回调底座即可） |

**V1.0 → V2.0 关键转变**：从「英语旁路权益」升级为「可挂多个业务应用的 SaaS 底座」；英语仍是首个接入方，但身份与租户不再外挂假定。

---

## 2. 从开源复用什么 / 不复用什么

| 维度 | 复用（逻辑） | 不复用（实现） |
|------|--------------|----------------|
| 分销 | 邀请码/链接归因、一单一归属、比例佣金、退款冲正、分销商后台 | ThinkPHP/CRMEB 页面与表结构原样拷贝 |
| 月结 | 自然月关账、冷静期后再入账、月结单 → 审核 → 打款 | 绑定某家支付插件写死流程 |
| 货架 | 「推荐板块 / 店铺首页」= 经营者自选 N 门课排序 | 整站商城主题与多级类目 |
| 积分 | 行为入账、流水不可改、兑礼品/权益、防刷上限 | LINE/POS 等无关渠道实现 |
| 身份 | 账号 + 角色 + 组织成员（SaaS 常规） | 把业务库用户表当平台账号 |
| 学习 | — | 儿童 L 等级、测评、周报；权益侧**不可见**学习明细 |

**明确不做（除非单独立项）**：多级分销、经营者改价、CRMEB 直播/拼团整包搬入、把学习主线迁入底座。

---

## 3. 身份体系（SaaS 底座核心）

### 3.1 概念词典（禁止混用）

| 概念 | 英文 | 定义 | 示例 |
|------|------|------|------|
| **租户** | Tenant | 付费/开通的客户边界；数据与配置隔离单元 | 「某机构运营的英语站」「平台自营租户」 |
| **账号** | Account | 可登录的全局身份（手机号/邮箱/第三方） | 家长张三的登录凭证 |
| **成员** | Membership | 账号在某租户下的席位 + 角色集 | 张三在租户 A 是 `end_user`，同时可是 `partner` |
| **主体档案** | Subject Profile | 业务侧扩展档案（挂 Membership） | Partner 档案、收款信息；EndUser 积分账户 |
| **经营者** | Partner | 一级分销渠道身份（Membership 角色 + Partner 档案） | 带邀请码的渠道老师 |
| **终端用户** | EndUser | C 端购课/分享/兑换身份 | 家长账号在租户内的消费者席位 |
| **平台超管** | PlatformAdmin | 跨租户运维（底座运维，不属于业务租户成员） | 你们内部运维 |
| **租户管理员** | TenantAdmin | 租户内运营：费率、月结审核、礼品履约 | 机构运营同学 |
| **应用** | App / Client | 接入底座的业务产品 | `ai-smart-english` |

硬规则：

1. **所有业务数据必须带 `tenant_id`**（平台超管操作写审计，仍落到目标租户）。  
2. **角色挂在 Membership 上，不挂在 Account 全局**（同一人可在租户 A 是 Partner，在租户 B 只是 EndUser）。  
3. **Partner / EndUser 不是两套登录**，是同一 Account 在租户内的角色；升经营者 = 开通 Partner 角色 + 建 Partner 档案。  
4. **儿童/学员档案属于 Tenant App**，底座只存家长 Account；Partner Safe View 禁止下发学习明细。

### 3.2 关系图

```text
PlatformAdmin（跨租户）
        │
Tenant ─┬─ Membership(Account, roles[]) ─┬─ EndUserProfile → PointsAccount
        │                                 └─ PartnerProfile → Storefront / 收款 / 佣金率
        ├─ TenantConfig（费率、冷静期、积分规则、归因窗）
        ├─ Apps[]（client_id、回调密钥、允许事件）
        └─ Benefits 数据（Attribution / OrderRef / Commission / Settlement / Rewards…）

Account（全局唯一登录）── 可加入多个 Tenant（多个 Membership）
```

### 3.3 角色矩阵（租户内）

| 角色 | 能力 | 现金佣金 | 积分 |
|------|------|----------|------|
| `tenant_admin` | 商品/费率/月结审核/礼品履约/Partner 开通 | — | — |
| `partner` | 专属链接、自选货架、看佣金与月结、收款信息 | ✅ | 可选「助力积分」规则 |
| `end_user` | 购课、分享、兑礼品/权益 | ❌ 默认 | ✅ |
| `ops_readonly` | 只读报表 | — | — |

平台级：`platform_admin`（开租户、停用租户、全局审计）。

### 3.4 终端用户 ↔ 经营者升级

```text
Account 注册/登录
  → 加入 Tenant（Membership: end_user）
  → 可选：申请 / 运营开通 partner
       → Membership 增加角色 partner
       → 创建 PartnerProfile（邀请码、默认佣金率、收款信息、状态）
```

互斥与激励（沿用 V1.0）：

1. **一单一归属**：订单有 `partner_id` → 走提成；无 → 归租户/平台。  
2. **终端分享只积不佣**；与分销归因并存时：有 Partner 归因则只记提成，分享人按租户配置给「助力积分」或 0。  
3. **提成基数 = 订单实付**（不含运费；优惠承担方在租户配置中声明）。  
4. **默认佣金率 30%**（可按 Partner 覆盖；租户可改默认值）。  
5. **退款冷静期**（建议 7～15 天，租户可配）过完，佣金才进入可月结池。

---

## 4. 三大权益能力（业务逻辑，租户内生效）

### 4.1 经营者提成 · 按月结算

**归因**

- 入口：`?p={partnerCode}` 或 `/p/{partnerCode}` → Cookie / local 归因，TTL 租户可配（建议 7～30 天）。  
- 归因键建议：`tenant_id + visitor_key + partner_code`。  
- 注册/下单时固化 `partner_id` 到订单投影；支付成功生成佣金明细。

状态机：

```text
pending（已支付，冷静期内）
  → eligible（过冷静期，可入月结）
  → in_statement（已进某月月结单）
  → paid（已打款）
冲正：clawback（退款/部分退按比例）
```

**月结**

| 步骤 | 时机 | 动作 |
|------|------|------|
| 关账任务 | 每月 1 日（或 T+2） | 按租户汇总上月 `eligible` → `SettlementStatement` |
| 审核 | 人工/半自动 | `tenant_admin` 确认金额与明细 |
| 打款 | 审核通过后 | 记录渠道与凭证，明细标 `paid` |
| 对账 | 随时 | Partner 下载月结单 PDF/CSV |

Partner 可见：本月预估、待结算、已结算历史、归因订单列表（金额/时间/佣金状态；**无儿童学习字段**）。

### 4.2 经营者首页：自选课程货架

- 从**本租户课程池**勾选，上限建议 4～8，可排序。  
- 访客打开租户域名下 `/p/{code}` → 品牌壳 + 该经营者货架；未选满用租户默认补位。  
- 课程下架 → 自动移出货架并通知 Partner。  
- **不改价、不改权益内容**；只改展示与入口。成交订单仍带该 `partner_id`。

对象：`PartnerStorefront { tenantId, partnerId, items[{ courseId, sort }], updatedAt }`

### 4.3 终端分享积分 · 兑礼品/权益

| 行为（租户可配置） | 建议积分 | 防刷 |
|--------------------|----------|------|
| 分享链接被有效打开 | 低 | 同设备/IP/日上限 |
| 被分享人完成注册 | 中 | 一人一计 |
| 被分享人首单（无 Partner 或规则允许） | 高 | 与提成互斥策略见 §3.4 |

兑换：

- **虚拟权益优先**（体验天数、评测次数、绘本解锁）— 履约经 Webhook 回写 Tenant App。  
- **实物礼品** P1：收货信息 + 发货状态。  
- 积分账户 = **不可变流水账本**（earn / redeem / expire / adjust）；余额由流水汇总，禁止直接改余额。

---

## 5. 领域模型（底座 + 权益）

### 5.1 Platform Kernel

```text
Tenant                 id, slug, name, status(active|suspended), plan, createdAt
Account                id, phone/email, passwordHash|oauth, status, mfa…
Membership             id, tenantId, accountId, roles[], status, invitedBy
PlatformAdmin          accountId, permissions[]          # 可选：与 Membership 分离表
TenantApp              id, tenantId, clientId, name, webhookUrl, webhookSecret, scopes[]
ApiKey                 id, tenantId, hash, scopes[], expiresAt
AuditLog               actorAccountId, tenantId?, action, resource, meta, at
IdempotencyKey         tenantId, scope, key, responseRef
```

### 5.2 Benefits Module（均含 tenantId）

```text
PartnerProfile         membershipId, inviteCode, commissionRate, payoutInfo, status
PartnerStorefront      partnerId, items[{ courseId, sort }], updatedAt
Attribution            visitorKey, partnerId, touch(first|last), expiresAt
OrderRef               externalOrderId, appId, amountPaid, partnerId?, accountId?, paidAt
CommissionLedger       orderRefId, partnerId, amount, status, holdUntil, clawbackOf?
SettlementStatement    period, partnerId?, total, reviewStatus, payoutProof
PointsAccount          membershipId（或 accountId+tenantId）, balanceCache?
PointsLedger           accountRef, type(earn|redeem|expire|adjust), amount, reason, operator?
RewardCatalog          sku, pointsPrice, stock, type(virtual|physical), fulfillAppEvent?
Redemption             ledgerId, sku, fulfillStatus, shipping?
TenantBenefitsConfig   defaultCommissionRate, attributionTtlDays, refundHoldDays, pointsRules[]
```

追溯链：

```text
分销：Partner → Attribution → OrderRef → CommissionLedger → SettlementStatement → Payout
积分：Share/Register/Pay 事件 → PointsLedger → Redemption →（Webhook）Tenant App 履约
身份：Account → Membership(tenant) → PartnerProfile | PointsAccount
```

### 5.3 最小 ER 示意

```text
Tenant 1──* Membership *──1 Account
Tenant 1──* TenantApp
Membership 1──0..1 PartnerProfile 1──0..1 PartnerStorefront
Membership 1──0..1 PointsAccount 1──* PointsLedger
Tenant 1──* OrderRef 1──0..* CommissionLedger
PartnerProfile 1──* CommissionLedger
Tenant 1──* SettlementStatement
Tenant 1──* RewardCatalog 1──* Redemption
```

---

## 6. 技术架构

### 6.1 总体

```text
                    ┌─ Admin Console（租户后台 / 平台超管）
Browser / App ──────┼─ Partner Console
                    └─ Tenant App SPA（如 ai-smart-english，含 /p/:code）
                              │
                    SSO / JWT（iss=platform, tenant_id, roles）
                              ▼
┌─────────────────────────────────────────────────────────┐
│  platform-api（新建）                                     │
│  /auth · /tenants · /memberships · /apps · /webhooks      │
│  /benefits/*（Partner · Commission · Settlement · Points）│
│  Workers：冷静期晋升 · 月结关账 · 积分过期 · Webhook 投递   │
└───────────────┬─────────────────────▲───────────────────┘
                │                     │
         PostgreSQL + Redis    Outbox / Webhook
                │                     │
                │              Tenant App 业务库
                │              （订单、课程、学习；底座不直连）
                ▼
         订单事件：order.paid / order.refunded / user.registered / share.click
         履约事件：reward.granted（底座 → App）
```

### 6.2 推荐技术选型

| 层 | 选型 | 理由 |
|----|------|------|
| 前端 | Vue 3 + TS；管理台与 Partner 台可同仓多入口 | 与首个业务 App 同栈 |
| 后端 | **NestJS** 模块化：`platform` / `benefits` / `workers` | 边界清晰，TS 全栈 |
| DB | PostgreSQL（强制 RLS 或中间件注入 `tenant_id`） | 账本、约束、报表 |
| 队列 | Redis + BullMQ | 关账、冷静期、过期、Webhook 重试 |
| 鉴权 | 底座签发 JWT/Session；App 可 SSO 或同父域 Cookie | 账号主权在底座 |
| 部署 | 私有化单机或 K8s；多租户逻辑隔离（首版共享库 + `tenant_id`） | 后期可按租户拆库 |

**租户隔离策略（首版）**：共享 Schema + 所有表 `tenant_id` + 请求上下文强制过滤；平台超管接口另鉴权。P2 再评估 schema-per-tenant。

### 6.3 与 Tenant App 解耦契约

底座**不读** App 内 `ActivityAttempt` 等学习表。

App → 底座（需签 HMAC，带 `tenant_id` + `app_id` + 幂等键）：

| 事件 | 用途 |
|------|------|
| `user.registered` | 绑定 Membership / 分享注册积分 |
| `order.paid` | 写 OrderRef + 佣金 pending + 可选积分 |
| `order.refunded` | 佣金 clawback + 积分冲正策略 |
| `share.click` | 可选；打开计分（防刷） |

底座 → App：

| 事件 | 用途 |
|------|------|
| `reward.granted` | 虚拟权益履约（天数、次数、解锁） |
| `partner.storefront.changed` | 可选缓存失效 |

---

## 7. API 草图

### 7.1 Platform

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/register` | 注册 Account |
| POST | `/auth/login` | 登录，返回 token（可含当前 tenant） |
| POST | `/auth/switch-tenant` | 切换租户上下文 |
| POST | `/platform/tenants` | 超管开租户 |
| GET/PATCH | `/tenants/me` | 当前租户资料 |
| POST | `/tenants/me/memberships` | 邀请/添加成员 |
| PATCH | `/tenants/me/memberships/:id/roles` | 改角色（含开通 partner） |
| POST | `/tenants/me/apps` | 注册 Tenant App、下发 client 密钥 |
| POST | `/tenants/me/api-keys` | 开放 API Key |

### 7.2 Benefits（均需租户上下文）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/p/:code/storefront` | 公开货架（解析租户域名或 query） |
| PUT | `/partner/me/storefront` | 改货架 |
| GET | `/partner/me/commissions` | 佣金明细 |
| GET | `/partner/me/statements` | 月结单 |
| POST | `/internal/events/order.paid` | App 回调（幂等） |
| POST | `/internal/events/order.refunded` | 退款冲正 |
| POST | `/points/earn` | 规则引擎入账（或仅内部消费事件） |
| GET | `/points/me` | 余额与流水 |
| GET | `/rewards` | 兑换目录 |
| POST | `/rewards/:id/redeem` | 兑换 |

管理端：Partner 审核、费率、关账重跑、打款标记、礼品发货、积分规则配置。

---

## 8. 配置项（租户级 + 平台级）

| 键 | 层级 | 默认 |
|----|------|------|
| `COMMISSION_RATE` | 租户 / Partner 覆盖 | `0.3` |
| `ATTRIBUTION_TTL_DAYS` | 租户 | `15` |
| `REFUND_HOLD_DAYS` | 租户 | `10` |
| `POINTS_RULES` | 租户 | JSON 规则表 |
| `SHARE_VS_COMMISSION` | 租户 | `assist_points` \| `zero` |
| `STOREFRONT_MAX_ITEMS` | 租户 | `8` |

平台级：租户套餐、Webhook 重试策略、超管名单。

---

## 9. 分期与验收

### P0｜底座可登录 + 能卖能算清（约 3～4 周量级）

- Tenant / Account / Membership / JWT 租户上下文  
- 首个租户 + 注册 `ai-smart-english` 为 TenantApp  
- Partner 邀请码 + 归因 + `/p/:code` 货架  
- `order.paid` / `order.refunded` → 佣金账本，默认 30%  
- 冷静期任务 + 月结单（打款可人工）  
- Partner 台：预估 / 明细 / 月结  

**验收**：开测试租户 → 建 Partner → 两单（一退一留）→ 月结 = 30%×实付；货架专属页正确；**无 tenant_id 的请求全部拒绝**。

### P1｜C 端裂变 + 履约闭环

- 分享积分规则 + 流水 + 虚拟权益兑换  
- `reward.granted` Webhook 回学习侧生效  
- 防刷：日上限、设备指纹/简单风控  
- 租户后台：积分规则与兑换目录配置  

**验收**：分享→注册→积分；兑换后 App 侧权益到账；流水不可篡改（仅 adjust）。

### P2｜多租户可售卖

- 平台超管开租户 / 停用；TenantApp 自助密钥轮换  
- 打款导出/半自动、实物礼品、对账报表  
- Partner 申请审核流、多费率模板  
- API Key + 签名事件文档（对外接入第二款 App）  
- 审计日志与合规导出  

**不做（除非单独立项）**：多级分销、经营者改价、schema-per-tenant 物理隔离、底座内嵌学习引擎。

---

## 10. 落地仓库建议

```text
AI-SuperMarket/
  platform-api/                 # 新建：Kernel + Benefits + Workers
  platform-admin/               # 可选：超管 + 租户运营台
  partner-console/              # 可选：经营者台（亦可 admin 多角色入口）
  ai-smart-english/             # 首个 Tenant App；SSO + 事件回调 + /p/:code
  方案-权益板块-分销积分-V1.0.md  # 本文档（文件名保留，内容为 V2.0）
```

模块包结构建议（NestJS）：

```text
platform-api/src/
  modules/platform/    # tenant, account, membership, auth, apps, audit
  modules/benefits/    # partner, attribution, commission, settlement, points, rewards
  modules/workers/     # hold→eligible, close-month, expire-points, webhook-retry
  common/              # tenant context, idempotency, outbox
```

---

## 11. 风险与合规

- 宣传避免「躺赚/多级」；一级分销 + 真实课程交付。  
- 佣金与积分流水可审计；调整走 `adjust` 并记操作者。  
- Partner 端严禁儿童学习明细（隐私）。  
- 多租户禁止串数据：集成测试必须含「跨 tenant_id 读取应 404」。  
- 开源仅作逻辑参考；自研实现，不嵌入 GPL 整仓。  
- 收款信息、证件等脱敏存储与访问控制。

---

## 12. 下一步（文档外执行）

1. 锁定栈：**NestJS + PostgreSQL + Redis/BullMQ**。  
2. 定首个租户 slug、冷静期、归因窗、分享积分表。  
3. 开 `platform-api` 骨架：Auth + Tenant 中间件 + 空 Benefits 模块。  
4. 学习端接 SSO 与 `order.paid` 假回调联调。  
5. P0 验收通过后，再挂真实支付与人工月结。

---

## 附录 A · V1.0 → V2.0 对照

| V1.0 | V2.0 |
|------|------|
| 「平台统一账号」外挂假定 | Account + Membership 由底座自有 |
| 单产品旁路 | Tenant + TenantApp，英语为第一个 App |
| Partner / User / Admin 三角色 | 角色在 Membership；另增 PlatformAdmin |
| 全局配置环境变量 | 租户级 `TenantBenefitsConfig` + 平台级套餐 |
| OrderRef 无租户 | 全表 `tenant_id` + App 签名事件 |
| 能否当 SaaS 底座：否 | **可以：Kernel 可售卖，Benefits 为可开关模块** |

## 附录 B · 与学习方案关系

本方案与 `方案-AI-Smart-儿童英语-V1.3.md` **并列**：学习主线不变；英语产品通过 SSO 与订单/履约事件接入底座。权益与分销是增长变现能力，不是学习引擎的一部分。

---

*V2.0 · 2026-11-20 · SaaS 底座补齐*
