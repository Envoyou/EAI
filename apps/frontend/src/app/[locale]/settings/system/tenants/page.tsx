import React from 'react';
import { isZohoDeskEnabled } from '@/lib/utils';
import { BillingAdmin } from '@/components/BillingAdmin';

export const metadata = {
  title: 'Tenant Management | EAI Settings',
};

export default function TenantsSystemPage() {
  return (
    <>
      <div className="settings-page-intro">
        <span className="ui-badge ui-badge-warning uppercase tracking-wider !text-[9px] mb-2 inline-flex">Internal Use Only</span>
        <h2 className="text-balance">Billing Administration</h2>
        <p className="text-pretty">Organization credit ledger and manual adjustments.</p>
      </div>
      <div className="-mx-5 mt-2">
        <BillingAdmin zohoDeskEnabled={isZohoDeskEnabled()} />
      </div>
    </>
  );
}
