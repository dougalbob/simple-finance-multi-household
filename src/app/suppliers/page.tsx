import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SupplierCardData, SupplierCardList } from '@/components/supplier-card';
import { TaskDueBadge } from '@/components/task-forms';
import { householdContextFromRequest } from '@/lib/auth/next';
import { listStoredAttachments, listStoredSupplierAttachments } from '@/lib/records/attachments';
import { categoryTree } from '@/lib/records/categories';
import { listPeople } from '@/lib/records/people';
import { listPurchases } from '@/lib/records/purchases';
import {
  INTERACTION_CHANNEL_LABELS,
  listSupplierInteractions,
  listSupplierReferences,
  type InteractionChannel,
} from '@/lib/records/supplier-details';
import {
  hasSupplierFocus,
  resolveSupplierFocus,
  supplierCardHref,
  supplierFocusKey,
} from '@/lib/records/supplier-focus';
import { listSuppliers } from '@/lib/records/suppliers';
import { purchaseLineSummary, targetNames } from '@/lib/records/targets';
import { compareTasksByDue, tasksByInteraction, taskDue } from '@/lib/records/tasks';
import { actorLabel, getTasksBySubject } from '@/lib/records/tasks-view';
import { listVehicles } from '@/lib/records/vehicles';
import { formatShortLocalDateWithYear, toLocalDateString } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * Suppliers (SPEC §21) — the reference desk. Collapsible contact cards with
 * label→value reference pairs, the shared interaction log (both users see
 * everything, every write is audited), and the recent purchases from that
 * supplier with their receipts. Desktop-first but fully reachable on mobile,
 * per SPEC §15.
 */
export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string; id?: string; q?: string }>;
}) {
  const user = await householdContextFromRequest();
  if (user === null) redirect('/unauthorized');

  const db = user.db;
  const now = new Date();
  const today = toLocalDateString(now);
  const suppliers = listSuppliers(db);
  const params = await searchParams;

  // Tasks and documents for every card at once (decision 175), and the names
  // behind the sign-in emails that wrote each log entry.
  const people = listPeople(db);
  const tasksBySupplier = getTasksBySubject(db, 'supplier', now);
  const documentsBySupplier = listStoredSupplierAttachments(
    db,
    suppliers.map((supplier) => supplier.id),
  );
  const actorNames = new Map(
    people.flatMap((person) =>
      person.email === null || person.email === ''
        ? []
        : [[person.email.toLowerCase(), person.label] as const],
    ),
  );

  // Who each recent purchase was for (decision 161). One supplier can hold a
  // contract per person — three mobile contracts with one carrier — and the
  // card is the only list that used to show `date · amount` alone. The child
  // category is enough here: the supplier already names the parent in effect,
  // and the card is half a column wide on a laptop (SPEC §21.4).
  const names = targetNames({ people, vehicles: listVehicles(db) });
  const categoryNames = new Map(
    categoryTree(db).flatMap((parent) =>
      parent.children.map((child) => [child.id, child.name] as const),
    ),
  );

  const cards: SupplierCardData[] = suppliers.map((supplier) => {
    const purchases = listPurchases(db, { supplierId: supplier.id, limit: 5 });
    const interactions = listSupplierInteractions(db, supplier.id, 20);
    const followUps = tasksByInteraction(
      db,
      interactions.map((interaction) => interaction.id),
    );
    return {
      supplier: {
        id: supplier.id,
        name: supplier.name,
        version: supplier.version,
        contactPhone: supplier.contactPhone,
        contactEmail: supplier.contactEmail,
        website: supplier.website,
        address: supplier.address,
        notes: supplier.notes,
      },
      references: listSupplierReferences(db, supplier.id),
      // Every line labelled and every date in words (decision 175): a bare
      // "2026-11-01" under a call read as nothing in particular.
      interactions: interactions.map((interaction) => {
        const task = followUps.get(interaction.id);
        return {
          id: interaction.id,
          channelLabel:
            INTERACTION_CHANNEL_LABELS[interaction.channel as InteractionChannel] ??
            interaction.channel,
          occurredOnLabel: formatShortLocalDateWithYear(
            toLocalDateString(interaction.occurredAt),
            today,
          ),
          summary: interaction.summary,
          outcome: interaction.outcome,
          loggedBy: actorLabel(interaction.createdBy, actorNames),
          followUp:
            task === undefined
              ? null
              : {
                  title: task.title,
                  dueDateLabel:
                    task.dueDate === null
                      ? null
                      : formatShortLocalDateWithYear(task.dueDate, today),
                  stateWords:
                    task.completedAt !== null
                      ? `Done ${formatShortLocalDateWithYear(toLocalDateString(task.completedAt), today)}`
                      : taskDue(task.dueDate, today).label,
                },
        };
      }),
      tasks: tasksBySupplier.get(supplier.id) ?? {
        open: [],
        doneRecently: [],
        openCount: 0,
        overdueCount: 0,
      },
      documents: documentsBySupplier.get(supplier.id) ?? [],
      recentPurchases: purchases.map(({ purchase, allocations }) => {
        const summary = purchaseLineSummary(allocations, categoryNames, names);
        return {
          id: purchase.id,
          date: toLocalDateString(new Date(purchase.occurredAt)),
          totalPence: purchase.totalPence,
          voided: purchase.voidedAt !== null,
          lineLabel: summary.label,
          extraLines: summary.extraLines,
          attachments: listStoredAttachments(db, purchase.id),
        };
      }),
    };
  });

  // Every open task about a supplier, overdue first. Until v0.25.0 this
  // banner read the interaction log's follow-up dates filtered to `>= today`,
  // so a promise vanished the day after it fell due (decision 175).
  const followUps = cards
    .flatMap((card) => card.tasks.open.map((task) => ({ supplier: card.supplier, task })))
    .sort((a, b) => compareTasksByDue(a.task, b.task, today));

  // "Supplier card" links (Recurring, Contracts & Renewals) name the supplier
  // they came from: the page opens with that card filtered, expanded and in
  // view, not as a collapsed list of everyone (decision 149). The fragment is
  // resolved in the client — a server never sees it.
  const focus = resolveSupplierFocus({
    supplierId: params.supplierId,
    id: params.id,
    q: params.q,
    suppliers: suppliers.map(({ id, name }) => ({ id, name })),
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Reference desk
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Suppliers</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          When something goes wrong, the number, the policy reference and the history of the
          conversation are here — not dug out of a drawer. Both of us see everything, and every
          entry records who wrote it.
        </p>
      </header>

      {followUps.length > 0 ? (
        <section
          aria-labelledby="supplier-follow-ups"
          className="mb-6 rounded-xl border border-warning-200 bg-warning-50 p-4"
        >
          <h2 id="supplier-follow-ups" className="text-sm font-semibold text-warning-900">
            Promised follow-ups
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm text-warning-900">
            {followUps.map(({ supplier, task }) => (
              <li key={task.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <TaskDueBadge task={task} />
                <Link className="font-medium hover:underline" href={supplierCardHref(supplier.id)}>
                  {supplier.name}
                </Link>
                <span>— {task.title}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-warning-900">
            Tick them off on each card, or see everything on{' '}
            <Link className="font-medium underline" href="/tasks">
              Tasks
            </Link>
            .
          </p>
        </section>
      ) : null}

      {cards.length === 0 ? (
        <section className="rounded-xl border border-border bg-surface p-6 text-ink-soft">
          Suppliers appear here after the first purchase, or can be added while entering one.
        </section>
      ) : (
        <SupplierCardList
          key={supplierFocusKey(focus)}
          cards={cards}
          focus={hasSupplierFocus(focus) ? focus : null}
        />
      )}
    </main>
  );
}
