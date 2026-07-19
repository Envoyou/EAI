import React from 'react';
import { UserDirectory } from '@/components/UserDirectory';
import { Badge } from '@/components/ui/badge';

export const metadata = {
  title: 'User Directory | EAI Admin Console',
};

export default function UsersAdminPage() {
  return (
    <>
      <div className="settings-page-intro">
        <Badge variant="warning" size="xs" className="mb-2 uppercase tracking-wider">Internal Use Only</Badge>
        <h2 className="text-balance">User Directory</h2>
        <p className="text-pretty">Chronological list of all user signups and their current organization status.</p>
      </div>
      <div className="mt-4">
        <UserDirectory />
      </div>
    </>
  );
}
