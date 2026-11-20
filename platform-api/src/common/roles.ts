/** System role codes (seeded). Assigned via MembershipRole / PlatformRoleBinding. */
export const TenantRoleCodes = {
  TENANT_OWNER: 'tenant_owner',
  TENANT_ADMIN: 'tenant_admin',
  BILLING_ADMIN: 'billing_admin',
  MEMBER_ADMIN: 'member_admin',
  OPERATOR: 'operator',
  MEMBER: 'member',
  READONLY: 'readonly',
} as const;

export const PlatformRoleCodes = {
  PLATFORM_OWNER: 'platform_owner',
  PLATFORM_ADMIN: 'platform_admin',
  PLATFORM_OPS: 'platform_ops',
  PLATFORM_FINANCE: 'platform_finance',
  PLATFORM_SUPPORT: 'platform_support',
  PLATFORM_AUDITOR: 'platform_auditor',
} as const;

export const PermissionCodes = {
  TENANT_MEMBER_INVITE: 'tenant.member.invite',
  TENANT_MEMBER_MANAGE: 'tenant.member.manage',
  BILLING_SUBSCRIPTION_MANAGE: 'billing.subscription.manage',
  BILLING_CHECKOUT: 'billing.checkout',
  WALLET_POINTS_ADJUST: 'wallet.points.adjust',
  APP_MANAGE: 'app.manage',
  CHANNEL_MANAGE: 'channel.manage',
  AFFILIATE_MANAGE: 'affiliate.manage',
} as const;
