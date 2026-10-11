import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  AssignIdentityForm,
  CreateHouseholdForm,
  RenameHouseholdForm,
  SetHouseholdStatusForm,
  UnassignIdentityForm,
} from '@/components/admin-forms';
import { RegistryBackup } from '@/components/registry-backup';
import { appSessionFromRequest } from '@/lib/auth/next';
import { getRegistry } from '@/lib/registry/db';
import {
  listHouseholds,
  listIdentities,
  listRegistryAudit,
  MAX_IDENTITIES_PER_HOUSEHOLD,
} from '@/lib/registry/domain';
import { formatInstantLocal } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * Platform administration (MULTI_HOUSEHOLD_PLAN §4): the roster of households
 * and the pre-assignment of sign-in identities. Operational metadata only —
 * this page (and the administrator role) grants no view of any household's
 * financial records. There is no self-sign-up; an identity becomes usable
 * only when an assignment exists here, and the app denies unassigned
 * identities at first login.
 */

const AUDIT_WORDS: Record<string, string> = {
  'system.bootstrap': 'Administrator bootstrapped',
  'household.create': 'Household created',
  'household.rename': 'Household renamed',
  'household.status': 'Household status changed',
  'identity.assign': 'Identity assigned',
  'identity.unassign': 'Identity unassigned',
  'identity.role': 'Role changed',
};

function auditWords(action: string): string {
  return AUDIT_WORDS[action] ?? action;
}

export default async function AdminPage() {
  const session = await appSessionFromRequest();
  if (
    session.status === 'not-signed-in' ||
    session.status === 'unassigned' ||
    session.status === 'registry-unavailable'
  ) {
    redirect('/unauthorized');
  }
  // `ok` and `household-deactivated` both carry the user: a platform
  // administrator must still be able to restore their own household.
  const user = session.user;

  if (user.role !== 'platform_admin') {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Platform administration
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Administrator only</h1>
        </header>
        <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-sm text-ink-soft">
            Platform administration is limited to the service administrator. Your household records
            are unaffected — open the app as usual.
          </p>
        </section>
      </main>
    );
  }

  const registry = getRegistry();
  const households = listHouseholds(registry);
  const identities = listIdentities(registry);
  const audit = listRegistryAudit(registry, 25);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Platform administration
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Households &amp; sign-in</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          Pre-assign each sign-in email to exactly one household before its first login — there is
          no self sign-up. Households hold one or two people. This page shows operational metadata
          only; household financial records stay in each household and are never visible here.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/support" className="font-medium text-accent underline">
            Support access granted to you
          </Link>{' '}
          <span className="text-ink-muted">— read-only views a household has opened to you.</span>
        </p>
      </header>

      <div className="space-y-6">
        <section
          aria-labelledby="admin-households-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="admin-households-heading" className="mb-1 text-lg font-semibold">
            Households ({households.length})
          </h2>
          <p className="mb-3 text-xs text-ink-muted">
            A deactivated household&apos;s members are denied sign-in until it is reactivated.
            Nothing is deleted when a household is deactivated.
          </p>

          <div className="space-y-4">
            {households.map((household) => {
              const members = identities.filter((i) => i.householdId === household.id);
              const slotsLeft = MAX_IDENTITIES_PER_HOUSEHOLD - members.length;
              return (
                <article
                  key={household.id}
                  id={`household-${household.id}`}
                  className="rounded-lg bg-canvas p-3"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="text-base font-semibold">{household.displayName}</h3>
                    <span className="text-xs text-ink-muted">
                      {household.status === 'active' ? 'Active' : 'Deactivated'}
                    </span>
                    <span className="text-xs text-ink-muted">id {household.id.slice(0, 8)}…</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    Created {formatInstantLocal(new Date(household.createdAt))} · {members.length}{' '}
                    of {MAX_IDENTITIES_PER_HOUSEHOLD} sign-in identities assigned
                  </p>

                  <ul className="mt-3 space-y-2">
                    {members.map((member) => (
                      <li key={member.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-sm">{member.email}</span>
                        <span className="text-xs text-ink-muted">
                          {member.role === 'platform_admin' ? 'Platform administrator' : 'Member'}
                          {' · assigned '}
                          {formatInstantLocal(new Date(member.createdAt))}
                        </span>
                        <UnassignIdentityForm email={member.email} />
                      </li>
                    ))}
                    {members.length === 0 ? (
                      <li className="text-sm text-ink-muted">
                        No sign-in identities assigned yet. This household cannot be used until at
                        least one is assigned.
                      </li>
                    ) : null}
                  </ul>

                  {slotsLeft > 0 ? (
                    <div className="mt-3">
                      <AssignIdentityForm householdId={household.id} slotsLeft={slotsLeft} />
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-ink-muted">
                      Two identities assigned — the one-or-two person limit is reached. Unassign one
                      first to swap.
                    </p>
                  )}

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-ink-soft">
                      Rename or change status
                    </summary>
                    <div className="mt-2 grid gap-4 sm:grid-cols-2">
                      <RenameHouseholdForm
                        householdId={household.id}
                        currentName={household.displayName}
                      />
                      <SetHouseholdStatusForm
                        householdId={household.id}
                        status={household.status}
                        displayName={household.displayName}
                      />
                    </div>
                  </details>
                </article>
              );
            })}
            {households.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No households yet. Create the first one below, then assign its sign-in emails.
              </p>
            ) : null}
          </div>
        </section>

        <section
          aria-labelledby="admin-create-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="admin-create-heading" className="mb-1 text-lg font-semibold">
            Create a household
          </h2>
          <p className="mb-3 text-xs text-ink-muted">
            A name for your own reference — members see their app, not this list.
          </p>
          <CreateHouseholdForm />
        </section>

        <section
          aria-labelledby="admin-audit-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="admin-audit-heading" className="mb-1 text-lg font-semibold">
            Recent registry activity
          </h2>
          <p className="mb-3 text-xs text-ink-muted">
            Every roster change, who made it and when. Household financial audits stay inside each
            household&apos;s own data.
          </p>
          <ol className="space-y-1">
            {audit.map((entry) => (
              <li key={entry.id} className="text-sm">
                <span className="text-ink-muted">{formatInstantLocal(new Date(entry.at))}</span>
                {' · '}
                <span>{auditWords(entry.action)}</span>
                {entry.email !== null ? <span> · {entry.email}</span> : null}
                <span> · by {entry.actor}</span>
              </li>
            ))}
            {audit.length === 0 ? <li className="text-sm text-ink-muted">Nothing yet.</li> : null}
          </ol>
        </section>

        <RegistryBackup />
      </div>
    </main>
  );
}
