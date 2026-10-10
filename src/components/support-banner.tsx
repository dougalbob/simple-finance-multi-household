import Link from 'next/link';
import { headers } from 'next/headers';
import { LeaveSupportViewForm } from '@/components/support-forms';
import { supportBannerState } from '@/lib/auth/support';
import { loadAppConfig } from '@/lib/config';
import { formatInstantLocal } from '@/lib/time';

/**
 * Visible on every page while support access is in play (MULTI_HOUSEHOLD_PLAN
 * §4: "clearly visible"). Two forms: an administrator in a read-only support
 * view, and a household whose support access is currently granted. Any failure
 * to read the registry shows nothing rather than guessing.
 */
export async function SupportBanner() {
  let state;
  try {
    state = await supportBannerState(await headers(), loadAppConfig());
  } catch {
    return null;
  }

  if (state.viewing !== null) {
    return (
      <div
        role="status"
        className="border-b border-danger-200 bg-danger-50 px-4 py-2 text-sm text-danger-800"
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
          <p>
            <span className="font-semibold">Read-only support view</span> of{' '}
            <span className="font-semibold">{state.viewing.householdName}</span>. You are not seeing
            your own household, and nothing can be changed. Access ends{' '}
            {formatInstantLocal(new Date(state.viewing.expiresAt))}.
          </p>
          <div className="flex items-center gap-3">
            <Link href="/support" className="underline">
              Support sessions
            </Link>
            <LeaveSupportViewForm />
          </div>
        </div>
      </div>
    );
  }

  if (state.shared !== null) {
    return (
      <div role="status" className="border-b border-border bg-surface-muted px-4 py-2 text-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
          <p>
            <span className="font-semibold">Support access is on.</span> {state.shared.supportEmail}{' '}
            can view {state.shared.householdName} read-only until{' '}
            {formatInstantLocal(new Date(state.shared.expiresAt))}.
          </p>
          <Link href="/settings#support-access" className="text-ink-soft underline">
            Manage in Settings
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
