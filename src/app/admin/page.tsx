import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CloudflareInspection } from '@/components/cloudflare-inspection';
import { AdminDisclosure } from '@/components/admin-disclosure';
import {
  AssignIdentityForm,
  CreateHouseholdForm,
  RenameHouseholdForm,
  SetHouseholdStatusForm,
  UnassignIdentityForm,
} from '@/components/admin-forms';
import { AdminPresence } from '@/components/admin-presence';
import { AdminSettings } from '@/components/admin-settings';
import { RegistryBackup } from '@/components/registry-backup';
import { appSessionFromRequest } from '@/lib/auth/next';
import { isRegistryAdminSession } from '@/lib/auth/current-user';
import { loadAppConfig } from '@/lib/config';
import { envDrift, readEnvFile } from '@/lib/env-file';
import { getRegistry } from '@/lib/registry/db';
import { buildPresenceView } from '@/lib/registry/presence';
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
  'config.update': 'Server settings changed',
  'cloudflare.grant': 'Cloudflare grant',
  'cloudflare.remove': 'Cloudflare removal',
};

function auditWords(action: string): string {
  return AUDIT_WORDS[action] ?? action;
}

function cloudflareAuditOutcome(action: string, detail: string | null): string | null {
  if (!['cloudflare.grant', 'cloudflare.remove'].includes(action) || detail === null) return null;
  try {
    const outcome: unknown = JSON.parse(detail).outcome;
    const labels: Record<string, string> = {
      pending: 'Attempt started',
      changed: 'Change verified',
      noop: 'No change needed',
      refused: 'Refused before write',
      unknown: 'Outcome unknown — review required',
    };
    return typeof outcome === 'string' ? (labels[outcome] ?? null) : null;
  } catch {
    return null;
  }
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
  // Presence (issue 105): open visits and the closed-visit log. Reading it is
  // also what closes visits that have gone quiet — there is no background job.
  const presence = buildPresenceView(registry);

  // Server settings (issue #91): the env-file editor is strictly the
  // REGISTRY_ADMIN_EMAIL identity — a promoted platform_admin does not see it.
  const config = loadAppConfig();
  const showEnvEditor = isRegistryAdminSession(session, config);
  const envFile = readEnvFile(config);
  const settingsValues = {
    issuer: envFile.values.AUTH_ISSUER ?? config.auth.issuer ?? '',
    audience: envFile.values.AUTH_AUDIENCE ?? config.auth.audience ?? '',
    certsUrl: envFile.values.AUTH_CERTS_URL ?? '',
    allowedEmails: envFile.values.AUTH_ALLOWED_EMAILS ?? config.auth.allowedEmails.join(','),
    cloudflareAccessUrl:
      envFile.values.CLOUDFLARE_ACCESS_URL ?? config.auth.cloudflareAccessUrl ?? '',
  };
  const activeHouseholds = households.filter((household) => household.status === 'active').length;

  return (
    <main className="mx-auto max-w-[88rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Platform administration
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">
            Households &amp; sign-in
          </h1>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            Manage each household and its sign-in emails in one place. There is no self sign-up;
            every identity needs an assignment here before its first login.
          </p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            This page shows operational metadata only; household financial records stay in each
            household and are never visible here.
          </p>
        </div>
        <div className="shrink-0 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm lg:max-w-xs">
          <Link href="/support" className="text-sm font-medium sf-link">
            Support access granted to you
          </Link>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            Read-only views a household has opened to you.
          </p>
        </div>
      </header>

      <dl className="mb-5 grid grid-cols-3 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="px-4 py-3 sm:px-5">
          <dt className="text-xs font-medium text-ink-muted">Households</dt>
          <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
            <span className="text-2xl font-semibold tracking-tight text-ink">
              {households.length}
            </span>
            <span className="text-xs text-ink-muted">{activeHouseholds} active</span>
          </dd>
        </div>
        <div className="border-l border-border px-4 py-3 sm:px-5">
          <dt className="text-xs font-medium text-ink-muted">Sign-in identities</dt>
          <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
            <span className="text-2xl font-semibold tracking-tight text-ink">
              {identities.length}
            </span>
            <span className="hidden text-xs text-ink-muted sm:inline">across the roster</span>
          </dd>
        </div>
        <div className="border-l border-border px-4 py-3 sm:px-5">
          <dt className="text-xs font-medium text-ink-muted">People with tabs open</dt>
          <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
            <span className="text-2xl font-semibold tracking-tight text-ink">
              {presence.counts.people}
            </span>
            <span className="text-xs text-ink-muted">{presence.counts.active} active now</span>
          </dd>
        </div>
      </dl>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <section
            aria-labelledby="admin-households-heading"
            className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
          >
            <div className="border-b border-border px-5 py-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 id="admin-households-heading" className="text-lg font-semibold text-ink">
                  Households
                </h2>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-soft">
                  {households.length}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                Up to two sign-in identities per household. People records used for attribution are
                separate and are not capped. Open a household&apos;s management controls to assign,
                rename or change its status.
              </p>
            </div>

            <div className="max-h-[46rem] space-y-3 overflow-y-auto p-4 sm:p-5">
              {households.map((household) => {
                const members = identities.filter(
                  (identity) => identity.householdId === household.id,
                );
                const slotsLeft = MAX_IDENTITIES_PER_HOUSEHOLD - members.length;
                return (
                  <article
                    key={household.id}
                    id={`household-${household.id}`}
                    className="overflow-hidden rounded-xl border border-border bg-canvas/55"
                  >
                    <details data-household-details className="group/household">
                      <summary className="min-h-12 cursor-pointer list-none px-4 py-3 transition-colors hover:bg-surface/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
                        <h3 className="flex w-full items-center justify-between gap-3 text-base font-semibold text-ink">
                          <span>{household.displayName}</span>
                          <span
                            aria-hidden="true"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-ink-soft"
                          >
                            <svg
                              viewBox="0 0 20 20"
                              fill="none"
                              className="h-4 w-4 transition-transform duration-150 group-open/household:rotate-180"
                            >
                              <path
                                d="m5 7.5 5 5 5-5"
                                stroke="currentColor"
                                strokeWidth="1.75"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                        </h3>
                      </summary>
                      <div className="border-t border-border">
                        <div className="p-4">
                          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                            <div className="min-w-0">
                              <span
                                className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                  household.status === 'active'
                                    ? 'bg-positive-50 text-positive-800'
                                    : 'bg-warning-100 text-warning-900'
                                }`}
                              >
                                {household.status === 'active' ? 'Active' : 'Deactivated'}
                              </span>
                              <p className="mt-1 text-xs text-ink-muted">
                                Created {formatInstantLocal(new Date(household.createdAt))}
                                <span className="text-ink-faint"> · </span>id{' '}
                                {household.id.slice(0, 8)}…
                              </p>
                            </div>
                            <span className="text-xs font-medium text-ink-soft">
                              {members.length} of {MAX_IDENTITIES_PER_HOUSEHOLD} sign-in identities
                              assigned
                            </span>
                          </div>

                          <ul className="mt-3 space-y-2">
                            {members.map((member) => (
                              <li
                                key={member.id}
                                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border-hairline bg-surface px-3 py-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <span className="break-all text-sm font-medium text-ink-body">
                                      {member.email}
                                    </span>
                                    <span className="text-xs text-ink-muted">
                                      {member.role === 'platform_admin'
                                        ? 'Platform administrator'
                                        : 'Member'}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 text-xs text-ink-muted">
                                    Assigned {formatInstantLocal(new Date(member.createdAt))}
                                  </p>
                                </div>
                                <UnassignIdentityForm email={member.email} />
                              </li>
                            ))}
                            {members.length === 0 ? (
                              <li className="rounded-lg border border-dashed border-border-strong bg-surface px-3 py-2 text-sm text-ink-muted">
                                No sign-in identities assigned yet. Add one below before this
                                household can be used.
                              </li>
                            ) : null}
                          </ul>

                          {slotsLeft === 0 ? (
                            <p className="mt-3 text-xs text-ink-muted">
                              Two sign-in identities assigned — the household limit is reached.
                              Unassign one first to swap.
                            </p>
                          ) : null}
                        </div>

                        <details
                          data-household-management
                          className="group/manage border-t border-border"
                        >
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-surface/60 px-4 py-2.5 text-xs font-semibold text-ink-soft transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
                            <span>
                              Manage household
                              <span className="ml-2 font-normal text-ink-muted">
                                Assign, rename or change status
                              </span>
                            </span>
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 20 20"
                              fill="none"
                              className="h-4 w-4 shrink-0 transition-transform duration-150 group-open/manage:rotate-180"
                            >
                              <path
                                d="m5 7.5 5 5 5-5"
                                stroke="currentColor"
                                strokeWidth="1.75"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </summary>
                          <div className="border-t border-border-hairline bg-surface/45 p-4">
                            {slotsLeft > 0 ? (
                              <AssignIdentityForm
                                householdId={household.id}
                                slotsLeft={slotsLeft}
                              />
                            ) : null}
                            <div
                              className={`grid gap-4 sm:grid-cols-2 ${
                                slotsLeft > 0 ? 'mt-4 border-t border-border-hairline pt-4' : ''
                              }`}
                            >
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
                          </div>
                        </details>
                      </div>
                    </details>
                  </article>
                );
              })}
              {households.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border-strong p-6 text-center text-sm text-ink-muted">
                  No households yet. Create the first one, then assign its sign-in emails.
                </p>
              ) : null}
            </div>
          </section>

          <section
            aria-labelledby="admin-audit-heading"
            className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 id="admin-audit-heading" className="text-lg font-semibold text-ink">
                  Recent registry activity
                </h2>
                <p className="mt-1 text-xs leading-5 text-ink-muted">
                  Up to 25 roster and access changes, newest first. Scroll the list for earlier
                  entries. Financial audit entries stay inside each household&apos;s own data.
                </p>
              </div>
              <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-soft">
                Latest {audit.length}
              </span>
            </div>
            <ol
              tabIndex={0}
              aria-label="Registry activity, newest first"
              className="max-h-80 overflow-y-auto px-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              {audit.map((entry) => {
                const outcome = cloudflareAuditOutcome(entry.action, entry.detail);
                return (
                  <li
                    key={entry.id}
                    className="grid gap-1 border-b border-border-hairline py-3 last:border-0 sm:grid-cols-[10.5rem_minmax(0,1fr)] sm:gap-4"
                  >
                    <time dateTime={entry.at} className="text-xs leading-5 text-ink-muted">
                      {formatInstantLocal(new Date(entry.at))}
                    </time>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-body">
                        {auditWords(entry.action)}
                        {outcome !== null ? (
                          <span className="ml-2 text-xs font-normal text-ink-muted">{outcome}</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 break-words text-xs leading-5 text-ink-muted">
                        {entry.email !== null ? <span>{entry.email} · </span> : null}
                        by {entry.actor}
                      </p>
                    </div>
                  </li>
                );
              })}
              {audit.length === 0 ? (
                <li className="py-6 text-sm text-ink-muted">Nothing yet.</li>
              ) : null}
            </ol>
          </section>
        </div>

        <aside aria-label="Create household and connection overview" className="min-w-0 space-y-5">
          <section
            aria-labelledby="admin-create-heading"
            className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
          >
            <h2 id="admin-create-heading" className="text-lg font-semibold text-ink">
              Create a household
            </h2>
            <p className="mb-4 mt-1 text-xs leading-5 text-ink-muted">
              A name for your own reference. Add its sign-in email next from the new household card.
            </p>
            <CreateHouseholdForm />
          </section>

          <AdminPresence initial={presence} me={user.email} />
        </aside>
      </div>

      {showEnvEditor ? (
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section
            aria-labelledby="admin-tools-heading"
            className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
          >
            <div className="border-b border-border px-5 py-4">
              <h2 id="admin-tools-heading" className="text-lg font-semibold text-ink">
                Server &amp; access tools
              </h2>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                Infrequent configuration and provider controls stay tucked away until you need them.
              </p>
            </div>
            <div className="divide-y divide-border">
              <AdminDisclosure
                title="Cloudflare access"
                description="Compare policy emails with the roster and make explicit access changes."
              >
                <CloudflareInspection
                  emails={identities.map((identity) => identity.email)}
                  administrator={config.registryBootstrap.adminEmail!}
                />
              </AdminDisclosure>
              <AdminDisclosure
                title="Server settings"
                description="Authentication, the optional allowlist and the Cloudflare dashboard bookmark."
              >
                <AdminSettings
                  initialValues={settingsValues}
                  envPath={envFile.path}
                  fileExists={envFile.exists}
                  readError={envFile.readError}
                  drift={envDrift(envFile, config)}
                />
              </AdminDisclosure>
            </div>
          </section>
          <RegistryBackup />
        </div>
      ) : (
        <div className="mt-5">
          <RegistryBackup />
        </div>
      )}
    </main>
  );
}
