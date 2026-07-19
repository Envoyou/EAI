import React from 'react';
import { isZohoDeskEnabled } from '@/lib/utils';
import { BillingAdmin } from '@/components/BillingAdmin';
import { Badge } from '@/components/ui/badge';

export const metadata = {
  title: 'Tenant Management | EAI Admin Console',
};

export default function TenantsAdminPage() {
  return (
    <>
      <div className="settings-page-intro">
        <Badge variant="warning" size="xs" className="mb-2 uppercase tracking-wider">Internal Use Only</Badge>
        <h2 className="text-balance">Billing Administration</h2>
        <p className="text-pretty">Organization credit ledger and manual adjustments.</p>
      </div>
      <div className="mt-4">
        <BillingAdmin zohoDeskEnabled={isZohoDeskEnabled()} />
      </div>
    </>
  );
}
