import { AsyncLocalStorage } from 'node:async_hooks';

export type TenantContextData = {
  tenantId: string;
  tenantSlug?: string;
  accountId?: string;
  membershipId?: string;
  roles?: string[];
};

const storage = new AsyncLocalStorage<TenantContextData>();

export const TenantContext = {
  run<T>(data: TenantContextData, fn: () => T): T {
    return storage.run(data, fn);
  },
  get(): TenantContextData | undefined {
    return storage.getStore();
  },
  requireTenantId(): string {
    const ctx = storage.getStore();
    if (!ctx?.tenantId) {
      throw new Error('TENANT_CONTEXT_MISSING');
    }
    return ctx.tenantId;
  },
};
