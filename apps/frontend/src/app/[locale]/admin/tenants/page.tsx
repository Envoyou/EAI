import React from 'react';
import { isZohoDeskEnabled } from '@/lib/utils';
import { BillingAdmin } from '@/components/BillingAdmin';

export const metadata = {
  title: 'Tenant Management | EAI Admin Console',
};

export default function TenantsAdminPage() {
  return (
    <>
      <div className="settings-page-intro">
        <span className="ui-badge ui-badge-warning uppercase tracking-wider !text-[9px] mb-2 inline-flex">Internal Use Only</span>
        <h2 className="text-balance">Billing Administration</h2>
        <p className="text-pretty">Organization credit ledger and manual adjustments.</p>
      </div>
      <div className="mt-4">
        <BillingAdmin zohoDeskEnabled={isZohoDeskEnabled()} />
      </div>
    </>
  );
}
