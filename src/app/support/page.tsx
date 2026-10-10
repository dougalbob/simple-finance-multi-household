import { redirect } from 'next/navigation';
import { LeaveSupportViewForm, OpenSupportViewForm } from '@/components/support-forms';
import { appSessionFromRequest } from '@/lib/auth/next';
import { getRegistry } from '@/lib/registry/db';
import { listSupportGrantsForAdministrator } from '@/lib/registry/support';
import { formatInstantLocal } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * Platform administrator's list of support access households have granted
 * (MULTI_HOUSEHOLD_PLAN §4). Opening one enters a read-only view of that
 * household only; it never gives standing access. Households not listed here
 * are simply not reachable.
 */
export default async function SupportPage() {
  const session = await appSessionFromRequest();
  if (
    session.status === 'not-signed-in' ||
    session.status === 'unassigned' ||
    session.status === 'registry-unavailable'
  ) {
    redirect('/unauthorized');
  }

  if (session.user.role !== 'platform_admin') {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        <h1 className="text-3xl font-semibold tracking-tight">Support access</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Support views are limited to the service administrator. Your household records are
          unaffected.
        </p>
      </main>
    );
  }

  const now = new Date();
  const grants = listSupportGrantsForAdministrator(getRegistry(), session.user.email, now);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Platform administration
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Support access</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          A household opens its records to you only by granting support access in its Settings. Each
          view is read-only, time-limited and recorded. Your own household is unaffected by any view
          you open here.
        </p>
      </header>

      <section
        aria-labelledby="support-grants-heading"
        className="rounded-xl border border-border bg-surface p-4 shadow-sm"
      >
        <h2 id="support-grants-heading" className="mb-2 text-lg font-semibold">
          Households that have granted you access
        </h2>
        {grants.length === 0 ? (
          <p className="text-sm text-ink-muted">No household has granted you access right now.</p>
        ) : (
          <ul className="space-y-4">
            {grants.map(({ grant, householdName }) => (
              <li key={grant.id} className="rounded-lg bg-canvas p-3">
                <p className="text-sm font-semibold">{householdName}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  Granted by {grant.grantedByEmail}. Read-only until{' '}
                  {formatInstantLocal(new Date(grant.expiresAt))}.
                </p>
                <div className="mt-2">
                  <OpenSupportViewForm grantId={grant.id} householdName={householdName} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <p className="mb-2 text-xs text-ink-muted">
          If you are already in a view, you can leave it here and return to your own household.
        </p>
        <LeaveSupportViewForm />
      </section>
    </main>
  );
}
