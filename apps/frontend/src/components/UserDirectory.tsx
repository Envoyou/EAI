'use client';

import dynamic from 'next/dynamic';
import { EAILoaderStatusIcon } from '@/components/ui/icons/status';
import { AlertCircle, ShieldAlert, Mail, X } from 'lucide-react';
import { useUserDirectory } from './user-directory/hooks/useUserDirectory';
import { UserTable } from './user-directory/components/UserTable';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const CreditAdjustmentModal = dynamic(
  () =>
    import('./user-directory/components/CreditAdjustmentModal').then(
      (mod) => mod.CreditAdjustmentModal
    ),
  { ssr: false }
);

const OrganizationDetailDrawer = dynamic(
  () =>
    import('./user-directory/components/OrganizationDetailDrawer').then(
      (mod) => mod.OrganizationDetailDrawer
    ),
  { ssr: false }
);

export function UserDirectory() {
  const dir = useUserDirectory();

  if (dir.error) {
    return (
      <Alert variant="danger" className="flex flex-col items-center justify-center min-h-[300px] text-center p-6">
        <AlertCircle className="h-8 w-8 mb-3 opacity-90" />
        <p className="font-semibold">Failed to load directory</p>
        <p className="text-sm opacity-90 mt-1">{dir.error}</p>
        <Button
          type="button"
          onClick={dir.fetchUsers}
          variant="danger"
          size="sm"
          className="mt-4 text-xs font-semibold"
        >
          Retry Loading
        </Button>
      </Alert>
    );
  }

  return (
    <>
      <UserTable
        users={dir.users}
        pagination={dir.pagination}
        loading={dir.loading}
        search={dir.search}
        searchInput={dir.searchInput}
        setSearchInput={dir.setSearchInput}
        planFilter={dir.planFilter}
        setPlanFilter={dir.setPlanFilter}
        statusFilter={dir.statusFilter}
        setStatusFilter={dir.setStatusFilter}
        sortBy={dir.sortBy}
        sortOrder={dir.sortOrder}
        page={dir.page}
        setPage={dir.setPage}
        copiedText={dir.copiedText}
        onSearchSubmit={dir.handleSearchSubmit}
        onClearFilters={dir.handleClearFilters}
        onSort={dir.handleSort}
        onCopyToClipboard={dir.copyToClipboard}
        onOpenDetails={dir.openDetailsModal}
        onOpenAdjustCredits={dir.openAdjustCreditsModal}
        onResendInvite={dir.triggerResendInviteModal}
        onToggleBanConfirm={dir.openBanConfirmModal}
      />

      {/* Dynamic Modal: Credit Adjustment */}
      {dir.activeModal === 'adjust-credits' && dir.selectedUser && (
        <CreditAdjustmentModal
          selectedUser={dir.selectedUser}
          adjustDirection={dir.adjustDirection}
          setAdjustDirection={dir.setAdjustDirection}
          adjustAmount={dir.adjustAmount}
          setAdjustAmount={dir.setAdjustAmount}
          adjustReason={dir.adjustReason}
          setAdjustReason={dir.setAdjustReason}
          adjustTicket={dir.adjustTicket}
          setAdjustTicket={dir.setAdjustTicket}
          adjustIdempotency={dir.adjustIdempotency}
          submittingAdjustment={dir.submittingAdjustment}
          onClose={() => dir.setActiveModal(null)}
          onSubmit={dir.handleAdjustCreditsSubmit}
        />
      )}

      {/* Dynamic Drawer: Audit Details */}
      {dir.activeModal === 'view-details' && dir.selectedUser && (
        <OrganizationDetailDrawer
          selectedUser={dir.selectedUser}
          detailsData={dir.detailsData}
          loadingDetails={dir.loadingDetails}
          activeDetailsTab={dir.activeDetailsTab}
          setActiveDetailsTab={dir.setActiveDetailsTab}
          onClose={() => dir.setActiveModal(null)}
        />
      )}

      {/* Ban / Unban Confirmation Modal */}
      {dir.activeModal === 'ban-confirm' && dir.selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-xl max-w-sm w-full p-6 shadow-2xl relative">
            <Button
              type="button"
              onClick={() => dir.setActiveModal(null)}
              variant="ghost"
              size="icon-xs"
              className="absolute right-4 top-4 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-lg"
            >
              <X className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`p-2.5 rounded-lg ${
                  dir.selectedUser.isBanned
                    ? 'bg-[var(--success)]/10 text-[var(--success)]'
                    : 'bg-[var(--destructive)]/10 text-[var(--destructive)]'
                }`}
              >
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-base">
                  {dir.selectedUser.isBanned ? 'Unban User' : 'Ban User Access'}
                </h3>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {dir.selectedUser.name || dir.selectedUser.email}
                </p>
              </div>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mb-6 leading-relaxed">
              {dir.selectedUser.isBanned
                ? 'Are you sure you want to lift the ban? The user will regain immediate access to sign in to their account and workspace.'
                : 'Are you sure you want to ban this user? They will be immediately blocked from signing in and using any Envoyou AI services.'}
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                onClick={() => dir.setActiveModal(null)}
                variant="outline"
                size="sm"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={dir.handleToggleBan}
                variant={dir.selectedUser.isBanned ? 'primary' : 'danger'}
                size="sm"
              >
                Confirm {dir.selectedUser.isBanned ? 'Unban' : 'Ban'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Resend Invite Modal */}
      {dir.activeModal === 'send-invite' && dir.selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-end p-0 animate-fade-in">
          <div className="bg-[var(--surface-1)] border-l border-[var(--border)] h-full max-w-md w-full p-6 shadow-2xl flex flex-col relative overflow-y-auto">
            <Button
              type="button"
              onClick={() => dir.setActiveModal(null)}
              variant="ghost"
              size="icon-xs"
              className="absolute right-4 top-4 text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-lg"
            >
              <X className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                <Mail className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Send Custom Onboarding Invitation</h3>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Target: {dir.selectedUser.email}
                </p>
              </div>
            </div>

            <form onSubmit={dir.handleSendInviteSubmit} className="flex flex-col gap-4 flex-1">
              <div>
                <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase block mb-1">
                  Email Subject
                </label>
                <Input
                  variant="surface"
                  type="text"
                  value={dir.inviteSubject}
                  onChange={(e) => dir.setInviteSubject(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase block mb-1">
                  Custom Message Content
                </label>
                <Textarea
                  variant="surface"
                  rows={8}
                  value={dir.inviteMessage}
                  onChange={(e) => dir.setInviteMessage(e.target.value)}
                  className="resize-none font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-2 mt-auto pt-4">
                <Button
                  type="button"
                  onClick={() => dir.setActiveModal(null)}
                  variant="outline"
                  size="sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={dir.sendingInvite}
                  variant="primary"
                  size="sm"
                  className="flex items-center gap-1.5"
                >
                  {dir.sendingInvite && <EAILoaderStatusIcon className="h-3.5 w-3.5" />}
                  <span>Send Email</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
