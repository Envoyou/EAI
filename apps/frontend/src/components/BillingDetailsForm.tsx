'use client';

import { fetchWithTimeout } from '@/lib/fetch-utils';

import React, { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getApiUrl } from '@/lib/api-url';
import { toast } from 'sonner';

interface BillingDetailsFormProps {
  organization: {
    id: string;
    name: string;
    npwp: string | null;
    billingAddress: string | null;
  } | null;
  isAdmin: boolean;
}

export default function BillingDetailsForm({ organization, isAdmin }: BillingDetailsFormProps) {
  const { getToken } = useAuth();
  const [name, setName] = useState(organization?.name || '');
  const [npwp, setNpwp] = useState(organization?.npwp || '');
  const [billingAddress, setBillingAddress] = useState(organization?.billingAddress || '');
  const [saving, setSaving] = useState(false);

  if (!organization) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    setSaving(true);
    try {
      const token = await getToken();
      const apiUrl = getApiUrl();
      const response = await fetchWithTimeout(`${apiUrl}/api/workspace/billing-details`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name, npwp, billingAddress }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to update billing details.');
      }

      toast.success('Billing details updated successfully.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An error occurred.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
      <div className="space-y-2">
        <label htmlFor="company-name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Company Legal Name
        </label>
        <Input
          variant="surface"
          id="company-name"
          type="text"
          value={name}
          disabled={!isAdmin}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Acme Corporation"
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="company-npwp" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Tax ID / NPWP (Optional)
        </label>
        <Input
          variant="surface"
          id="company-npwp"
          type="text"
          value={npwp}
          disabled={!isAdmin}
          onChange={(e) => setNpwp(e.target.value)}
          placeholder="e.g. 93.115.884.4-627.000"
        />
        <p className="text-[10px] text-muted-foreground">
          Required for B2B tax invoice validation. Leave empty if not applicable.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="billing-address" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Billing Address (Optional)
        </label>
        <Textarea
          variant="surface"
          id="billing-address"
          value={billingAddress}
          disabled={!isAdmin}
          onChange={(e) => setBillingAddress(e.target.value)}
          placeholder="e.g. Jl. Sudirman No. 12, Jakarta, 12190"
          className="min-h-20 resize-none"
        />
        <p className="text-[10px] text-muted-foreground">
          Will be printed on tax receipts and invoices instead of default location.
        </p>
      </div>

      {isAdmin && (
        <Button
          type="submit"
          disabled={saving}
          variant="primary"
          size="sm"
        >
          {saving ? 'Saving...' : 'Save Billing Info'}
        </Button>
      )}
    </form>
  );
}
