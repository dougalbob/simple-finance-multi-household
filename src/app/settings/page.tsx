import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ProjectionSettingsForm } from '@/components/recurring';
import {
  AddVehicleForm,
  CategoryTreeEditor,
  CommitmentCategoriesForm,
  DefaultPurchasePotForm,
  PersonSignInForm,
  PotEditForm,
  TargetRenameForm,
  WarningLeadsForm,
} from '@/components/settings-forms';
import { BackupPanel } from '@/components/backup-panel';
import { GrantSupportForm, RevokeSupportForm } from '@/components/support-forms';
import { ThemeGallery } from '@/components/theme-gallery';
import { householdContextFromRequest } from '@/lib/auth/next';
import { householdSignInEmails, signInEmailChoices } from '@/lib/auth/sign-in-choices';
import { inspectDocuments } from '@/lib/backup/backup';
import { getRegistry } from '@/lib/registry/db';
import { listIdentities } from '@/lib/registry/domain';
import {
  listSupportAudit,
  listSupportGrants,
  supportGrantStatus,
  type SupportGrant,
  type SupportGrantStatus,
} from '@/lib/registry/support';
import { formatInstantLocal } from '@/lib/time';
import { APP_VERSION } from '@/lib/version';
import { categoryTree } from '@/lib/records/categories';
import { getCommitmentCategoryPicker } from '@/lib/records/charts-view';
import { listPeople } from '@/lib/records/people';
import { listPots } from '@/lib/records/pots';
import { getProjectionView } from '@/lib/records/money-view';
import {
  getContractEndWarningLeadDays,
  getDefaultPurchasePotId,
  getMonthlyFuelByVehicle,
  getRenewalWarningLeadDays,
  getWeeklyGroceriesPence,
} from '@/lib/records/settings';
import { listVehicles } from '@/lib/records/vehicles';
import { currentTheme } from '@/lib/theme/next';
import { themeFamilies } from '@/lib/theme/theme';

export const dynamic = 'force-dynamic';

/**
 * Settings (SPEC §15.2): household names, per-pot edit, the category tree
 * editor, projection figures, warning leads and the payday/income pointer.
 * Everything here is visible, editable and audited in the domain layer —
 * there are no hidden switches (blueprint §1 transparency rule).
 */
export default async function SettingsPage() {
  const user = await householdContextFromRequest();
  if (user === null) redirect('/unauthorized');

  const db = user.db;
  const now = new Date();
  const people = listPeople(db);
  const vehicles = listVehicles(db);
  const pots = listPots(db);
  const registry = getRegistry();
  // The household's own assigned sign-ins only (MULTI_HOUSEHOLD_PLAN §2).
  const emailChoices = signInEmailChoices(
    householdSignInEmails(registry, user.householdId),
    people,
  );
  const documentsStatus = user.readOnly
    ? null
    : await inspectDocuments(user.dbHandle, user.documentsDir);
  const support = supportSettingsView(registry, user.householdId, now);
  const tree = categoryTree(db);
  const fuelByVehicle = getMonthlyFuelByVehicle(db);
  const defaultPurchasePotId = getDefaultPurchasePotId(db);
  const commitmentPicker = getCommitmentCategoryPicker(db);
  const projection = getProjectionView(db, now);
  const theme = await currentTheme();

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Settings</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Household configuration</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          Every change is saved with who made it and when — the audit trail keeps the before/after
          values, so nothing here is ever silently overwritten.
        </p>
      </header>

      <div className="space-y-6">
        <section
          aria-labelledby="household-names-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="household-names-heading" className="mb-1 text-lg font-semibold">
            Household names
          </h2>
          <p className="mb-3 text-xs text-ink-muted">
            Names stay short and unique (up to 60 characters). Renaming never touches history —
            records keep pointing at the same person or vehicle.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {people.map((person) => (
              <div key={person.id} className="rounded-lg bg-canvas p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Person
                </p>
                <TargetRenameForm
                  kind="person"
                  targetId={person.id}
                  version={person.version}
                  currentLabel={person.label}
                />
                <PersonSignInForm
                  personId={person.id}
                  personLabel={person.label}
                  email={person.email}
                  choices={emailChoices}
                />
              </div>
            ))}
            {vehicles.map((vehicle) => (
              <div key={vehicle.id} className="rounded-lg bg-canvas p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Vehicle
                </p>
                <TargetRenameForm
                  kind="vehicle"
                  targetId={vehicle.id}
                  version={vehicle.version}
                  currentLabel={vehicle.label}
                />
                <p className="mt-2 text-xs text-ink-muted">
                  Owner:{' '}
                  {people.find((person) => person.id === vehicle.ownerPersonId)?.label ??
                    'none (shared)'}{' '}
                  — the Fuel form starts on this vehicle for its owner.
                </p>
              </div>
            ))}
            <AddVehicleForm people={people.map(({ id, label }) => ({ id, label }))} />
          </div>
          {people.length === 0 && vehicles.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              Add the household people from the home page, or add a shared vehicle here.
            </p>
          ) : null}
        </section>

        <section
          aria-labelledby="quick-entry-settings-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="quick-entry-settings-heading" className="mb-1 text-lg font-semibold">
            Quick entry
          </h2>
          <p className="mb-3 text-xs text-ink-muted">
            The till form (home page and Overview) shows the chosen pot&apos;s last reported balance
            and what is left before income lands. Both come from the records here — never a bank
            feed.
          </p>
          <DefaultPurchasePotForm
            pots={pots.map(({ id, label }) => ({ id, label }))}
            defaultPotId={defaultPurchasePotId}
          />
        </section>

        <section
          aria-labelledby="pots-settings-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="pots-settings-heading" className="mb-1 text-lg font-semibold">
            Pots
          </h2>
          <p className="mb-3 text-xs text-ink-muted">
            Bank overdraft thresholds drive the household warning banner. Credit-card limits and
            near-limit thresholds describe card usage only; card pots are excluded from the “plan a
            transfer” shortfall watch. Cash pots have neither — a cash pot’s Owner is what gives
            them their pot in Quick Entry → Checkpoint cash.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {pots.map((pot) => (
              <div key={pot.id} className="rounded-lg bg-canvas p-3">
                <p className="mb-2 text-sm font-semibold text-ink-body">{pot.label}</p>
                <PotEditForm
                  potId={pot.id}
                  version={pot.version}
                  label={pot.label}
                  kind={pot.kind}
                  ownerPersonId={pot.ownerPersonId}
                  people={people.map(({ id, label }) => ({ id, label }))}
                  overdraftLimitPence={pot.overdraftLimitPence}
                  warningThresholdPence={pot.warningThresholdPence}
                  creditCardPaymentDayOfMonth={pot.creditCardPaymentDayOfMonth}
                  creditCardWarningDays={pot.creditCardWarningDays}
                  creditCardPromotionalEndDate={pot.creditCardPromotionalEndDate}
                  creditCardStatementDueDate={pot.creditCardStatementDueDate}
                  creditCardStatementMinimumPence={pot.creditCardStatementMinimumPence}
                />
              </div>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="categories-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="categories-heading" className="mb-1 text-lg font-semibold">
            Category tree
          </h2>
          <p className="mb-3 text-xs text-ink-muted">
            Two levels: parents group children, and entries always land on a child. Retiring a child
            blocks new assignments but keeps its history; parents stay while history points at them.
            The seeded categories can be renamed, extended and retired like any other.
          </p>
          <CategoryTreeEditor
            tree={tree.map((parent) => ({
              id: parent.id,
              name: parent.name,
              version: parent.version,
              retired: parent.retiredAt !== null,
              children: parent.children.map((child) => ({
                id: child.id,
                name: child.name,
                version: child.version,
                retired: child.retiredAt !== null,
              })),
            }))}
          />
        </section>

        <section
          aria-labelledby="projection-figures-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="projection-figures-heading" className="mb-1 text-lg font-semibold">
            Projection figures
          </h2>
          <p className="mb-3 text-xs text-ink-muted">
            The size of the household's usual weekly shop and of a typical fill for each vehicle.
            The payday projection and the horizon project each next event from when you last
            recorded one — a fresh shop resets the week, a fresh fill resets that vehicle's month.
            The Insights honesty loop compares these with recent actuals — blank clears a figure.
          </p>
          <div className="max-w-2xl">
            <ProjectionSettingsForm
              data={{
                weeklyGroceriesPence: getWeeklyGroceriesPence(db),
                monthlyFuelPence: vehicles.map((vehicle) => ({
                  vehicleId: vehicle.id,
                  label: vehicle.label,
                  pence: fuelByVehicle.get(vehicle.id) ?? null,
                })),
              }}
            />
          </div>
        </section>

        <section
          id="commitment-categories"
          aria-labelledby="commitment-categories-heading"
          className="scroll-mt-24 rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="commitment-categories-heading" className="mb-1 text-lg font-semibold">
            Fixed commitments (the direct-debit chart)
          </h2>
          <p className="mb-3 text-xs text-ink-muted">
            Which child categories count as a fixed commitment on{' '}
            <Link href="/charts#commitments" className="font-medium text-accent hover:underline">
              Charts
            </Link>
            . “Direct debit” is not a field on a purchase, so this list is the definition — tick
            Insurance and Road Tax but leave Fuel alone, for instance. The chart has its own
            “schedule-converted only” toggle for the strict bills-only view, which needs nothing
            here. Saved with the usual audit entry.
          </p>
          <CommitmentCategoriesForm
            groups={commitmentPicker.groups}
            source={commitmentPicker.source}
          />
        </section>

        <section
          aria-labelledby="warning-leads-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="warning-leads-heading" className="mb-1 text-lg font-semibold">
            Warning leads
          </h2>
          <p className="mb-3 text-xs text-ink-muted">
            How many days ahead the app should warn about renewals and contract end dates on the
            overview and in key dates.
          </p>
          <WarningLeadsForm
            renewalLeadDays={getRenewalWarningLeadDays(db)}
            contractEndLeadDays={getContractEndWarningLeadDays(db)}
          />
        </section>

        <section
          aria-labelledby="backup-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="backup-heading" className="mb-1 text-lg font-semibold">
            Backup &amp; restore
          </h2>
          {documentsStatus === null ? (
            <p className="text-sm text-ink-soft">
              Backup and restore are not available from a support view. Nothing here can take or
              replace the household&apos;s records.
            </p>
          ) : (
            <>
              <p className="mb-3 max-w-3xl text-xs text-ink-muted">
                This household&apos;s backup holds only this household&apos;s records and
                attachments, with a checksum manifest that names this household. A restore replaces
                this household&apos;s data only — never another household&apos;s — and keeps the
                previous copy on disk.
              </p>
              <BackupPanel appVersion={APP_VERSION} documentsStatus={documentsStatus} />
            </>
          )}
        </section>

        <section
          id="support-access"
          aria-labelledby="support-access-heading"
          className="scroll-mt-24 rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="support-access-heading" className="mb-1 text-lg font-semibold">
            Support access
          </h2>
          {user.readOnly ? (
            <p className="text-sm text-ink-soft">
              You are viewing this household as support, read-only. Support access is managed by the
              household itself.
            </p>
          ) : (
            <SupportAccessPanel view={support} />
          )}
        </section>

        <section
          id="appearance"
          aria-labelledby="appearance-heading"
          className="scroll-mt-24 rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="appearance-heading" className="mb-1 text-lg font-semibold">
            Appearance
          </h2>
          <p className="mb-3 max-w-3xl text-xs text-ink-muted">
            Fourteen palettes, each in a light and a dark form. The choice is remembered{' '}
            <span className="font-semibold">on this device only</span> — a cookie, not a household
            setting — so the phone at the checkout can run dark while the laptop stays on paper.
            Every card below is the real thing: the same components the app is built from, wearing
            that theme. Nothing else changes — the figures, the wording and the warnings are
            identical in all of them, and every theme is checked for contrast before it ships.
          </p>
          <ThemeGallery current={theme.id} families={themeFamilies()} />
        </section>

        <section
          aria-labelledby="payday-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="payday-heading" className="mb-1 text-lg font-semibold">
            Payday &amp; income
          </h2>
          <p className="mb-3 text-xs text-ink-muted">
            The projection plans to the next expected income schedule. Income is configured as a
            receipt schedule, not as a setting here.
          </p>
          {projection !== null &&
          projection.paydayScheduleId === null &&
          projection.receiptLines.some((line) => line.expected === true) ? (
            <p className="text-sm">
              Planning to <span className="font-semibold">the next expected support payment</span> —
              a debt&rsquo;s expected inflow won this cycle (it is owed money that is expected,
              never received income). Add an income schedule in{' '}
              <Link href="/recurring" className="font-medium text-accent hover:underline">
                Recurring →
              </Link>{' '}
              to plan to income instead.
            </p>
          ) : null}
          {projection !== null && projection.paydayScheduleId !== null ? (
            <p className="text-sm">
              Planning to <span className="font-semibold">{projection.paydayScheduleName}</span> —{' '}
              <Link
                href={`/recurring#schedule-edit-${projection.paydayScheduleId}`}
                className="font-medium text-accent hover:underline"
              >
                edit the schedule in Recurring →
              </Link>
            </p>
          ) : (
            <p className="text-sm text-ink-soft">
              No income schedule yet. Add one in{' '}
              <Link href="/recurring" className="font-medium text-accent hover:underline">
                Recurring
              </Link>{' '}
              (kind: receipt) and the projection will plan to it.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

const SUPPORT_STATUS_WORDS: Record<SupportGrantStatus, string> = {
  active: 'active',
  expired: 'expired',
  revoked: 'ended by the household',
};

const SUPPORT_AUDIT_WORDS: Record<string, string> = {
  'support.grant': 'Access granted',
  'support.revoke': 'Access ended',
  'support.open': 'Administrator opened the view',
  'support.access': 'First use of the view',
};

interface SupportSettingsView {
  active: { grant: SupportGrant; supportEmail: string } | null;
  history: SupportGrant[];
  administrators: Array<{ email: string }>;
  audit: Array<{ id: number; at: string; actor: string; action: string }>;
}

function supportSettingsView(
  registry: ReturnType<typeof getRegistry>,
  householdId: string,
  now: Date,
): SupportSettingsView {
  const grants = listSupportGrants(registry, householdId);
  const activeGrant = grants.find((grant) => supportGrantStatus(grant, now) === 'active') ?? null;
  return {
    active:
      activeGrant === null ? null : { grant: activeGrant, supportEmail: activeGrant.supportEmail },
    history: grants.slice(0, 10),
    administrators: listIdentities(registry)
      .filter(
        (identity) => identity.role === 'platform_admin' && identity.householdId !== householdId,
      )
      .map((identity) => ({ email: identity.email })),
    audit: listSupportAudit(registry, householdId, 12),
  };
}

function SupportAccessPanel({ view }: { view: SupportSettingsView }) {
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-ink-soft">
        A platform administrator can see this household only if you grant it here. The access is
        read-only, lasts 1, 4 or 24 hours, is shown on every page while it is active, and ends the
        moment you end it. Nobody can see your records otherwise.
      </p>

      {view.active !== null ? (
        <div className="rounded-lg border border-border-strong bg-canvas p-3">
          <p className="text-sm font-semibold">
            Support access is active for {view.active.supportEmail}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Read-only until {formatInstantLocal(new Date(view.active.grant.expiresAt))}.
          </p>
          <div className="mt-2">
            <RevokeSupportForm
              grantId={view.active.grant.id}
              supportEmail={view.active.supportEmail}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">No support access is granted right now.</p>
          <GrantSupportForm administrators={view.administrators} />
        </div>
      )}

      {view.history.length > 0 ? (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Recent grants</h3>
          <ul className="space-y-1 text-xs text-ink-soft">
            {view.history.map((grant) => (
              <li key={grant.id}>
                {grant.supportEmail} — {SUPPORT_STATUS_WORDS[supportGrantStatus(grant, new Date())]}
                {' · '}granted by {grant.grantedByEmail}{' '}
                {formatInstantLocal(new Date(grant.createdAt))}
                {' · '}until {formatInstantLocal(new Date(grant.expiresAt))}
                {grant.firstUsedAt !== null
                  ? ` · first used ${formatInstantLocal(new Date(grant.firstUsedAt))}`
                  : ' · not used yet'}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {view.audit.length > 0 ? (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Support activity</h3>
          <ul className="space-y-1 text-xs text-ink-soft">
            {view.audit.map((entry) => (
              <li key={entry.id}>
                {formatInstantLocal(new Date(entry.at))} —{' '}
                {SUPPORT_AUDIT_WORDS[entry.action] ?? entry.action} ({entry.actor})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
