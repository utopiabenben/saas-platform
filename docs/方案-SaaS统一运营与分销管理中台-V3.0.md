# SaaS 统一运营与分销管理中台｜总体方案 V3.0

> 版本：V3.0 · 日期：2026-11-20
> 目标：为 ShareDAO、AI Smart 儿童英语、数字商品商店、出口认证平台及未来业务提供统一的 SaaS 身份、租户、账户、订阅、计量、权益、支付与分销能力。
> V2.0 文档保留为历史版本；本文作为后续产品与架构基准。

## 1. 产品定位与核心决策

建设一套可多产品接入、可私有部署、可配置商业模式的 SaaS 中台。各业务系统通过统一身份认证和标准 API 接入，业务数据仍由各自应用管理。

平台负责：身份与组织、应用目录、套餐订阅、订单支付、账户与权益、用量计量、渠道分销、佣金结算、平台运营和开放接入。

业务应用负责：自身业务对象与流程、商品内容及履约；向中台回传支付、退款、使用量、注册等标准事件；按中台授予的订阅权益和额度提供服务。

**关键边界：** 平台登录账户、租户订阅、现金钱包、积分账户、AI 使用额度、功能权益、分销佣金是不同账本，禁止用一个 balance 字段混合表达。

## 2. 核心对象与关系

| 对象 | 定义 | 关键说明 |
|---|---|---|
| Platform | SaaS 平台运营主体 | 管理产品目录、平台策略和渠道政策 |
| Account | 全局登录身份 | 可加入多个租户 |
| Tenant | 客户组织/经营主体 | 数据、成员、配置、账单的主要隔离边界 |
| Workspace | 租户内协作空间 | 可选，用于团队/项目隔离 |
| Membership | Account 在 Tenant 中的成员关系 | 角色与权限挂在 Membership |
| Application | 平台提供的独立 SaaS 产品 | ShareDAO、英语、数字商品、认证等 |
| TenantApp | 某租户开通的某个应用实例 | 可有独立域名、配置和应用角色 |
| Plan | 应用套餐定义 | 价格、周期、功能、额度、席位限制 |
| Subscription | 租户购买的套餐实例 | 生效、续费、升级、降级、暂停、到期 |
| Wallet / Ledger | 现金或权益账户及流水 | 不同账户类型分开建账 |
| ChannelPartner | SaaS 渠道合作方 | 销售订阅、引入客户、获取渠道佣金 |
| AffiliatePartner | 业务推广伙伴 | 推广租户商品/课程，按订单获得佣金 |
| End User | 租户业务终端用户 | 在具体应用中消费或使用服务 |

~~~text
Platform
 ├─ Application Catalog ─ Plan / Feature / Price
 ├─ Channel Network ─ ChannelPartner ─ Tenant Referral ─ SaaS Commission
 └─ Account（全局身份）
      ├─ Tenant A ─ Membership ─ Workspace / Roles
      │    ├─ TenantApp: ShareDAO ─ Subscription ─ Entitlements
      │    ├─ TenantApp: Digital Store ─ Orders / Points / Wallet
      │    └─ TenantApp: AI English ─ Orders / Learning（业务自有）
      └─ Tenant B ─ Membership ─ TenantApp ...

TenantApp business events ──> Platform Event Gateway
Platform ledgers / entitlements ──> TenantApp entitlement API
~~~

一个 Account 可以加入多个 Tenant；一个 Tenant 可以开通多个 Application；一个 Application 可以服务多个 Tenant。Tenant 与 Application 的开通关系必须由 TenantApp 表达，不能把 Tenant.plan 当作唯一套餐字段。

## 3. 功能模块与优先级

| 模块 | 核心功能 | 优先级 |
|---|---|---|
| 身份中心 | Account、登录方式、验证、SSO、会话、账号安全 | P0 |
| 租户组织中心 | Tenant、Workspace、Membership、邀请、成员离职 | P0 |
| 权限中心 | RBAC、应用级角色、资源权限、数据范围 | P0 |
| 应用接入中心 | Application、TenantApp、OAuth Client、API Key、Webhook | P0 |
| 产品套餐中心 | 产品目录、Plan、Feature、Price、权益配置 | P1 |
| 订阅订单中心 | 开通、续费、升级降级、订单、支付、退款、发票 | P1 |
| 账户权益中心 | 现金钱包、积分、AI额度、权益包、账本 | P1 |
| 用量计量中心 | API、Token、任务、存储、席位等计量 | P1 |
| 分销渠道中心 | 渠道商、代理、推广伙伴、客户归属、佣金政策 | P2 |
| 结算中心 | 佣金账本、结算单、打款、对账 | P2 |
| 运营管理中心 | 租户、账号、财务、风控、审计、运营报表 | P0/P1 |
| 开放平台 | API 文档、SDK、事件订阅、密钥轮换、沙箱 | P1 |

## 4. 身份、租户与成员

### 4.1 Account 全局身份

Account 是全平台唯一用户身份，不等同于租户用户资料。支持手机号、邮箱、微信等登录标识；同一人可绑定多个 Identity。支持密码/验证码/OAuth/OIDC/SSO、验证、密码重置、MFA、设备与会话管理、账号冻结、注销申请、数据导出与删除流程。

建议模型：
- Account：id、displayName、avatar、status、locale、createdAt。
- AccountIdentity：accountId、provider、identifier、verifiedAt、credentialRef。
- Session：accountId、device、ip、expiresAt、revokedAt。
- AccountSecurityEvent：登录失败、密码变更、MFA、异常登录等。

手机号/邮箱作为 Identity 管理，不建议直接作为 Account 主键，便于用户更换登录方式。

### 4.2 Tenant 租户

租户是客户组织和数据隔离边界。字段至少包括名称、唯一 slug、logo、行业、联系人、时区、币种、语言、主体类型、企业资料、开票信息、销售负责人、渠道来源、品牌域名、安全策略、数据保留策略。

租户状态与订阅状态分开。Tenant 生命周期建议：trial、active、past_due、suspended、closed。订阅欠费可先进入宽限期，再按策略限制功能，避免把 Tenant 状态与单个应用订阅绑定。

### 4.3 Membership 与 Workspace

- Membership 唯一键：tenantId + accountId。
- 一个 Account 在同一 Tenant 只有一条 Membership，可有多个角色。
- Workspace 是租户内可选协作单元；成员可加入多个 Workspace。
- 邀请需有过期时间、邀请人、目标角色、接受状态。
- 成员禁用或移除后，立即撤销会话或刷新权限缓存。
- 租户所有者转移需二次确认和审计记录。

### 4.4 权限模型

采用 RBAC + 应用级权限 + 数据范围：
- 平台角色：platform_owner、platform_admin、platform_ops、platform_finance、platform_support、platform_auditor。
- 租户角色：tenant_owner、tenant_admin、billing_admin、member_admin、operator、member、readonly。
- 应用角色由 Application 定义，例如 ShareDAO 的 content_operator。
- 渠道角色独立于 Tenant Membership，例如 channel_owner、channel_sales。
- 权限使用 permission code 表达，如 tenant.member.invite、billing.subscription.manage、wallet.points.adjust。
- 每个 API 同时校验身份、租户上下文、应用授权、资源归属与数据范围。

禁止仅凭前端隐藏按钮实现权限控制。

## 5. 应用与套餐管理

### 5.1 Application 产品目录

平台管理员维护应用目录：applicationKey、名称、描述、图标、产品类型、状态、版本、自助开通策略、试用策略、私有部署策略、默认角色、初始化模板、回调地址与授权范围。

初始应用登记：ShareDAO、AI Smart 儿童英语、Digital Store、CertReport AI / 出口认证。

### 5.2 Plan / Feature / Price

套餐定义与购买实例分离。

Plan 包含 applicationId、planCode、名称、版本、状态、计费周期（月/年/一次性/按量）、价格、币种、试用期、自动续费策略、功能权益、席位和用量配额、超额策略。

Feature 支持 boolean、limit、metered、tier 类型。PlanFeature 绑定具体功能及额度值。

价格变化必须版本化；已有订阅保留价格快照，后台改价不得影响历史合同。

### 5.3 TenantApp

TenantApp 表示租户开通某个应用的实例，字段包括 tenantId、applicationId、instanceKey、customDomain、status、appConfig、locale、timezone、branding、clientId、secretHash、webhook config。一个 Tenant 可以拥有多个应用实例；是否允许同应用多实例由产品策略决定。

## 6. 订阅、订单、支付与账单

### 6.1 订阅生命周期

~~~text
trialing → active → past_due → grace_period → suspended → expired
                    ↘ canceled（周期结束或立即终止）
active → upgrade / downgrade（生成变更记录与差价订单）
~~~

必须支持试用开通、正式购买、手动开通、渠道赠送；月付/年付/一次性/按量计费；自动续费、失败重试、宽限期、到期提醒；升级即时生效并按剩余周期计算差价；降级默认下周期生效；取消续费、暂停、恢复、到期、欠费限制；订阅变更历史与价格快照。

### 6.2 订单与支付

订单类型至少包括：
- SaaS_SUBSCRIPTION：应用订阅。
- SAAS_ADDON：增购席位、额度、存储包等。
- BUSINESS_ORDER：业务应用商品/课程订单（中台只同步必要摘要）。
- CHANNEL_PURCHASE：渠道采购或预充值（未来启用时）。

支付模块抽象支付渠道，不把微信/支付宝逻辑写死在业务模块。包括支付单、支付尝试、支付回调、退款单、退款回调；金额使用 Decimal，明确币种、税额、优惠、应付、实付。所有回调验签、幂等、状态机校验。支付成功进入 Outbox，再异步激活订阅或入账。退款按商品和权益规则回收未使用权益；已消耗额度按合同策略处理。

发票/收据记录抬头、税号、金额、状态、申请时间和开具信息；开票可由外部服务或人工完成。

### 6.3 SaaS 订单与业务订单边界

平台订阅订单属于中台；业务 App 的商品订单留在业务系统。业务 App 回传必要订单事件，供佣金、积分或经营分析使用。禁止为了统计把完整业务订单库复制到中台。

## 7. 账户中心：余额、积分、额度与权益

### 7.1 账户类型必须拆分

| 账户 | 用途 | 可否提现 | 来源 |
|---|---|---|---|
| Cash Wallet | 用户可消费现金余额/储值 | 需独立合规评估 | 充值、退款、调账 |
| Points Account | 活动积分、兑换积分 | 否 | 分享、签到、活动、消费奖励 |
| Usage Credit | AI调用、Token、任务次数等额度 | 否 | 套餐、额度包、活动赠送 |
| Entitlement | 功能、席位、时长、次数等权益 | 否 | 订阅、兑换、运营授权 |
| Commission Payable | 渠道/推广伙伴应结佣金 | 达到结算条件后打款 | 有效订单佣金 |

禁止把积分当现金、把 AI 额度当积分、把佣金当用户余额。首期可只实现积分和 Usage Credit；现金钱包充值/提现需另行评估支付与财务合规。

### 7.2 统一账本规则

每种账户独立 Ledger：
- 余额由不可变流水计算，缓存余额仅用于查询加速。
- 流水记录 sourceType、sourceId、eventId、amount、direction、expiresAt、operator、reason。
- 唯一幂等键防止重复入账。
- 冲正采用反向流水，不允许修改或删除历史流水。
- 并发扣减使用事务、行锁或条件更新，禁止透支。
- 支持日终核对：期初 + 入账 - 出账 = 期末。
- 调账需权限、原因、审批（高金额双人复核）和审计。

### 7.3 积分规则

支持注册、邀请、分享有效访问、购买、活动、人工奖励；支持有效期、过期批次、每日/每用户上限、黑名单、设备/IP 风控。兑换时锁定库存并原子扣减积分；失败自动释放或退回积分。退款时按规则冲回奖励积分。兑换商品支持虚拟权益与实物履约。

### 7.4 AI / 功能额度

Usage Credit 支持按应用、模型、功能、租户、成员设置额度；计量单位包括 Token、调用次数、生成图片数、视频秒数、任务数。支持预扣、实际结算、退还差额、失败返还；套餐额度、购买额度包、运营赠送额度分别标记来源。额度不足时可提醒、降级模型、阻断或允许超额计费。用量明细可追溯 requestId、applicationId、tenantId、memberId。

## 8. 用量计量与配额控制

Metering Pipeline：
1. App/网关产生 Usage Event。
2. 校验签名、幂等键、应用和租户归属。
3. 写入原始用量事件（不可变）。
4. 按分钟/小时/账期聚合。
5. 与套餐额度比较，生成配额消耗或超额账单。
6. 向租户和管理员提供用量查询、预警与导出。

首批计量项：AI 请求数、输入/输出 Token、模型；内容任务数、图片数、视频秒数；成员席位、工作空间数；文件容量；API 请求数、错误率、并发；按需启用业务订单量和活跃用户量。

必须定义统一单位、计量窗口、重复事件处理、延迟事件修正和账期冻结规则。套餐限制由服务端统一执行。

## 9. 分销与渠道管理

### 9.1 两种分销业务必须分开

**A. SaaS 渠道分销（销售平台产品）**
- 渠道商推广 ShareDAO、英语、数字商品等 SaaS 产品。
- 产生租户线索、客户归属、订阅订单、续费佣金。
- 支持渠道层级、区域、授权产品、渠道价格、销售目标。
- 首期只启用一级渠道；多级关系可预留数据结构，多级分佣需单独审批和合规评估。

**B. 业务商品推广（推广租户内商品）**
- AffiliatePartner 推广某 TenantApp 的课程、商品或服务。
- 归因到业务订单，计算推广佣金。
- 不自动获得 SaaS 渠道权限，也不能访问租户管理数据。

两类 Partner、合同、佣金政策、结算账户独立。同一 Account 可同时拥有两种身份。

### 9.2 渠道对象

ChannelPartner（渠道主体、状态、等级、区域、合同、负责人）；ChannelMembership（渠道成员）；ChannelAuthorization（可销售产品/套餐/区域）；Lead（线索来源、归属、跟进阶段、保护期）；TenantReferral（渠道与 Tenant 归属关系）；ChannelCommissionPolicy（新购、续费、升级、退款佣金规则）；ChannelCommissionLedger；ChannelSettlement。

原 V2.0 的课程推广 Partner 保留为 AffiliatePartner 业务线，不能与 SaaS 渠道商共用佣金表和状态机。

### 9.3 佣金规则

佣金政策按产品、套餐、订单类型、渠道等级、合同版本配置。明确佣金基数、税费、折扣、退款、续费是否参与；订单锁定比例和政策版本。退款/部分退款生成冲正流水。佣金状态：pending、eligible、in_statement、approved、paid、reversed。支持按月结算、最低起付金额、人工审核、批量付款与凭证。防止自购、重复归因、渠道抢单、过期线索和虚假订单。

## 10. 运营后台与用户工作台

### 10.1 平台超级管理后台

1. 总览：租户数、活跃租户、订阅收入、到期订阅、用量、渠道贡献。
2. 租户管理：创建、审核、暂停、恢复、关闭、转移所有者。
3. 账号管理：检索、身份验证状态、冻结、会话撤销、隐私请求。
4. 应用管理：应用目录、版本、接入凭证、回调、授权范围。
5. 套餐管理：套餐、价格、功能、额度、试用、上下架。
6. 订阅订单：订阅详情、支付、退款、续费、升级、发票。
7. 账户管理：现金、积分、额度账户查询与授权调账。
8. 渠道管理：渠道商、线索、客户归属、佣金政策、结算。
9. 用量与风控：用量趋势、超额、异常调用、风险账户。
10. 系统管理：角色权限、操作审计、Webhook、密钥、任务队列。

### 10.2 租户管理后台

租户资料、品牌、域名、成员与角色；已开通应用、订阅套餐、续费与账单；使用量、额度、增购包；终端用户、业务推广伙伴（按应用授权）；积分规则、兑换目录、履约；订单摘要、佣金与渠道数据；API 接入、Webhook 日志、密钥轮换。

### 10.3 个人账户中心

统一个人资料与登录安全；我的租户/组织与应用入口；我的订阅、订单、支付记录、发票；我的积分、AI额度、权益及流水；我的邀请与推广收益（仅对应授权角色）；隐私设置、账号注销与数据导出。

### 10.4 渠道工作台

渠道资料、授权产品、合同与费率；客户线索、归属保护期、跟进状态；客户开通、订阅订单和续费情况；佣金预估、可结算、已结算、退款冲正；结算单、收款信息、付款凭证；团队销售成员与业绩（如授权）。

## 11. 核心 API 设计

统一前缀 /api/v1。所有内部接口要求认证、权限校验、租户上下文和幂等控制。

| 域 | 典型 API |
|---|---|
| Auth | POST /auth/register、/auth/login、/auth/refresh、/auth/logout、/auth/sso |
| Account | GET/PATCH /accounts/me、/accounts/me/identities、/accounts/me/sessions |
| Tenant | POST /platform/tenants、GET/PATCH /tenants/:id、POST /tenants/:id/invitations |
| Membership | GET /tenants/:id/members、PATCH /memberships/:id、POST /memberships/:id/roles |
| Application | GET /applications、POST /tenants/:id/apps、PATCH /tenant-apps/:id |
| Plan | GET /applications/:id/plans、POST /platform/plans |
| Subscription | POST /subscriptions、GET /subscriptions/:id、POST /subscriptions/:id/change、/cancel、/resume |
| Billing | GET /billing/orders、POST /billing/checkout、POST /billing/refunds、GET /billing/invoices |
| Wallet | GET /accounts/me/wallets、GET /wallets/:id/ledger |
| Points | GET /points/me、POST /points/earn（内部）、POST /points/redeem |
| Usage | POST /internal/usage-events、GET /tenants/:id/usage、GET /usage/summary |
| Channel | POST /channels、GET /channels/me/leads、POST /channels/leads、GET /channels/me/commissions |
| Settlement | GET /settlements、POST /settlements/:id/approve、POST /settlements/:id/mark-paid |
| Webhook | POST /internal/events、GET /webhooks/deliveries、POST /webhooks/:id/rotate-secret |

API 细化时补充请求/响应 Schema、错误码、权限码、幂等策略、分页和限流规则。公开 API 与内部事件入口分开。

## 12. 关键事件契约

统一事件信封：eventId、eventType、occurredAt、tenantId、applicationId、subjectId、requestId、idempotencyKey、version、data。使用 HMAC 签名、时间戳防重放、密钥版本和重试策略。事件接收后先持久化，再异步处理；使用 Inbox/Outbox 保证最终一致性。

App → Platform：user.registered、order.paid、order.refunded、usage.recorded、share.clicked。
Platform → App：subscription.activated、subscription.changed、subscription.expired、entitlement.granted、entitlement.revoked、points.changed、reward.granted、tenant.suspended、tenant.reactivated。

不得把密码、支付密钥、儿童学习明细等敏感数据放入事件 payload。

## 13. 数据模型清单

以下为逻辑实体清单，不要求一次性全部落库。

**身份与组织：** Account、AccountIdentity、Session、AccountSecurityEvent、Tenant、TenantProfile、Workspace、Membership、Invitation、Role、Permission、RolePermission、MembershipRole、WorkspaceMembership。

**应用与商业化：** Application、ApplicationVersion、TenantApp、OAuthClient、ApiKey、WebhookEndpoint、Plan、PlanVersion、Feature、PlanFeature、Price、Subscription、SubscriptionItem、SubscriptionChange、SubscriptionEvent、BillingOrder、Payment、PaymentAttempt、Refund、Invoice。

**账户与权益：** Wallet、WalletLedger、PointsAccount、PointsLedger、PointsRule、PointsLot、UsageAccount、UsageLedger、UsageEvent、UsageAggregate、Entitlement、EntitlementGrant、EntitlementUsage、EntitlementRevocation、RewardCatalog、Redemption、Fulfillment。

**渠道与分销：** ChannelPartner、ChannelMembership、ChannelAuthorization、ChannelContract、Lead、TenantReferral、ChannelCommissionPolicy、ChannelCommissionLedger、ChannelSettlement、AffiliatePartner、Attribution、AffiliateCommissionLedger、AffiliateSettlement。现有 OrderRef、PartnerStorefront 保留为业务推广域模型，逐步迁移命名。

**平台运营：** AuditLog、IdempotencyKey、OutboxEvent、InboxEvent、WebhookDelivery、UsageAlert、RiskEvent、DataExportRequest、PrivacyRequest。

所有租户数据表必须包含 tenantId，或通过强制租户归属关系可验证；跨租户关联由数据库约束与服务层双重校验。平台级数据明确标记 platform scope，不用空 tenantId 混淆。

## 14. 安全、隐私与可靠性

- Tenant 上下文来自已验证的 Session/JWT/API Client，不信任请求体传入的 tenantId。
- PostgreSQL 建议启用 RLS；服务层仍需强制租户过滤。平台级跨租户查询走独立权限和审计。
- 外部 API Key 仅展示一次，数据库只存 hash；Webhook Secret 加密存储并支持轮换。
- 支付回调、积分、额度、佣金、退款、兑换全部幂等。
- 账本写入采用事务；事件投递采用 Outbox/Inbox；异步任务支持重试、死信与人工补偿。
- 密码使用成熟密码哈希算法；敏感字段加密或脱敏；访问最小权限。
- 登录限流、验证码防刷、设备风险、API 限流、异常用量告警。
- 审计记录操作者、目标租户、资源、变更前后摘要、IP、时间和请求 ID。
- 数据导出、账号删除、租户关闭需有可追踪的审批与执行记录。
- 备份恢复、RPO/RTO、日志保留、数据驻留策略列入部署验收。

## 15. 分期实施建议

### P0：统一身份与租户底座
Account + AccountIdentity + Session；Tenant + Membership + Invitation + RBAC；Application + TenantApp + OAuth/API Key + Webhook；租户隔离、审计、幂等、Outbox/Inbox；平台后台的租户、账号、成员、应用管理。至少两个业务应用通过 SSO 接入，验证多租户隔离。

### P1：产品商业化闭环
Plan / Feature / Price；Subscription 生命周期、BillingOrder、Payment、Refund；个人账户中心、租户订阅管理、账单和发票记录；Entitlement 与 Usage Credit 账本；用量采集和套餐配额校验；先接一种支付渠道，支付服务保持可替换。

### P2：积分与渠道分销
Points 规则、流水、兑换、履约；SaaS Channel Partner、客户线索、归属、订阅佣金；Affiliate Partner 业务商品推广；佣金结算、对账、退款冲正、风控。

### P3：平台规模化
多币种、多语言、多税区；按量计费、超额账单、自动催收；渠道层级、区域授权、渠道团队；私有化部署授权、版本升级、租户迁移；运营分析与自动化。

## 16. 验收测试基线

| ID | 场景 | 预期结果 |
|---|---|---|
| TEN-001 | Account 加入两个 Tenant | 同一 Account 两条 Membership，数据隔离 |
| TEN-002 | Tenant A 用户请求 Tenant B 资源 | 拒绝且不泄露数据 |
| IAM-001 | 管理员邀请成员 | 邀请过期、接受、撤销流程正确 |
| IAM-002 | 成员被禁用 | 会话失效，后续 API 请求拒绝 |
| APP-001 | 一个 Tenant 开通两个 Application | 两个 TenantApp 配置独立 |
| SUB-001 | 租户购买月套餐 | 支付成功后订阅激活、权益授予 |
| SUB-002 | 升级/降级/取消/续费失败 | 按状态机和生效时间执行 |
| BILL-001 | 支付回调重复发送 | 只产生一笔支付和一次权益发放 |
| BILL-002 | 退款成功 | 订阅/额度/佣金按策略冲正 |
| WAL-001 | 并发扣减额度 | 不超扣、不出现负余额 |
| WAL-002 | 积分过期 | 过期流水生成，余额正确 |
| USG-001 | 重复上报 Usage Event | 只计量一次 |
| USG-002 | 套餐额度耗尽 | 按阻断/限速/超额策略执行 |
| CHN-001 | 渠道推荐客户购买订阅 | 客户归属正确，佣金按政策生成 |
| AFF-001 | Partner 推广业务订单 | 只生成业务推广佣金 |
| SET-001 | 退款发生在佣金结算前后 | 正确冲正或生成应收回款记录 |
| AUD-001 | 管理员调整积分/额度 | 记录操作者、原因、前后余额和审批 |
| EVT-001 | Webhook 失败 | 自动重试、死信可见、人工重放幂等 |

上线门槛：P0 用例全部通过；两个应用、两个租户的 SSO 和隔离测试通过；订阅支付、权益发放、退款冲正完成沙箱联调；账本可核对；重复事件不会重复入账；不存在通过前端传 tenantId 绕过隔离的路径。

## 17. 对现有 V2.0 的调整清单

| 现有设计 | V3.0 调整 |
|---|---|
| Tenant.plan 单字段 | 改为 TenantApp + Subscription + Plan |
| Account 直接以 phone/email 唯一 | 抽离 AccountIdentity，支持多登录方式 |
| roles[] 字符串 | RBAC 角色、权限、应用角色分层 |
| TenantApp 与订阅关系不清 | TenantApp 独立实例，Subscription 绑定实例 |
| 只有 PointsAccount | 增加 Wallet、UsageAccount、Entitlement 多账本 |
| 没有产品套餐和计量 | 增加 Plan、Feature、Price、Usage Event |
| 只有业务 Partner 分销 | 拆分 SaaS Channel Partner 与 Affiliate Partner |
| OrderRef 兼顾业务订单 | 中台订阅订单与业务订单摘要分离 |
| 仅人工月结 | 增加佣金政策版本、结算、对账、退款冲正 |
| Tenant 状态只有 active/suspended | Tenant 生命周期与 Subscription 生命周期分开 |
| Webhook 只有简单配置 | 增加 Outbox/Inbox、投递日志、重试与死信 |

## 18. 技术实施约束

继续使用 NestJS + PostgreSQL + Prisma + Redis/BullMQ。采用模块化单体起步，按领域拆模块，避免过早拆微服务。金额统一 Decimal；费率使用 Decimal 或整数基点，避免 Float 财务误差。所有账本流水不可变；订单/订阅状态通过状态机迁移。数据库 schema 先完成领域边界评审，再生成迁移；不得直接在生产库手改。管理后台与用户中心可独立前端入口，共用 API 与权限定义。所有对外接入提供沙箱租户、测试密钥、事件重放与 API 示例。

**最终目标：** 业务应用接入平台后，只需完成 SSO、订阅权益校验、用量上报和业务事件回传，即可复用统一的租户、账户、支付、积分、额度与分销能力。
