/** Membership roles — live on Membership, never on Account globally. */
export const MembershipRoles = {
  TENANT_ADMIN: 'tenant_admin',
  PARTNER: 'partner',
  END_USER: 'end_user',
  OPS_READONLY: 'ops_readonly',
} as const;

export type MembershipRole =
  (typeof MembershipRoles)[keyof typeof MembershipRoles];

export const PlatformRoles = {
  PLATFORM_ADMIN: 'platform_admin',
} as const;
