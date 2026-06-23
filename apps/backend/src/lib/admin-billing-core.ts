const SUPER_ADMIN_ROLES = new Set(['super-admin', 'super_admin', 'superadmin']);

export type BillingBalance = {
  total: number;
  trial: number;
  subscription: number;
  addon: number;
};

const normalizeRole = (role: string | null | undefined) =>
  (role || '').trim().toLowerCase();

export const isSuperAdminRole = (role: string | null | undefined) =>
  SUPER_ADMIN_ROLES.has(normalizeRole(role));

export const planCreditDeduction = (balance: BillingBalance, amount: number) => {
  let remaining = amount;
  const deductions: Array<{
    bucket: 'addon' | 'trial' | 'subscription';
    amount: number;
  }> = [];
  const buckets = [
    { bucket: 'addon' as const, available: Math.max(0, balance.addon) },
    { bucket: 'trial' as const, available: Math.max(0, balance.trial) },
    { bucket: 'subscription' as const, available: Math.max(0, balance.subscription) },
  ];

  for (const entry of buckets) {
    if (remaining <= 0 || entry.available <= 0) continue;
    const deduction = Math.min(remaining, entry.available);
    deductions.push({ bucket: entry.bucket, amount: -deduction });
    remaining -= deduction;
  }

  return { deductions, remaining };
};
