import React from 'react';
import { UserDirectory } from '@/components/UserDirectory';

export const metadata = {
  title: 'User Directory | EAI Admin Console',
};

export default function UsersAdminPage() {
  return (
    <>
      <div className="settings-page-intro">
        <span className="ui-badge ui-badge-warning uppercase tracking-wider !text-[9px] mb-2 inline-flex">Internal Use Only</span>
        <h2 className="text-balance">User Directory</h2>
        <p className="text-pretty">Chronological list of all user signups and their current organization status.</p>
      </div>
      <div className="mt-4">
        <UserDirectory />
      </div>
    </>
  );
}
