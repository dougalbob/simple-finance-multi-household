'use client';

import { useEffect, useMemo, useState } from 'react';
import { AttachmentForm } from '@/components/attachment-form';
import {
  SupplierContactForm,
  SupplierInteractionForm,
  SupplierReferenceForm,
} from '@/components/supplier-forms';
import { DoneTaskList, OpenTaskList, TaskCreateForm } from '@/components/task-forms';
import { formatPence } from '@/lib/money';
import type { StoredAttachment } from '@/lib/records/attachments';
import {
  hasSupplierFocus,
  resolveSupplierFocus,
  SupplierFocus,
} from '@/lib/records/supplier-focus';
import type { SupplierReference } from '@/lib/records/supplier-details';
import type { TaskRowView } from '@/lib/records/tasks-view';

function ChevronDownIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="2.5"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function ChevronUpIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="2.5"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5-7.5" />
    </svg>
  );
}

export interface SupplierCardData {
  supplier: {
    id: number;
    name: string;
    version: number;
    contactPhone: string | null;
    contactEmail: string | null;
    website: string | null;
    address: string | null;
    notes: string | null;
  };
  references: SupplierReference[];
  /** Newest first, with every date already in words (the server knows "today"). */
  interactions: SupplierInteractionView[];
  /** Open tasks about this supplier (overdue first) and the recently closed ones. */
  tasks: {
    open: TaskRowView[];
    doneRecently: TaskRowView[];
    openCount: number;
    overdueCount: number;
  };
  /** Letters, policy documents and terms attached to the supplier itself (v0.25.0). */
  documents: StoredAttachment[];
  recentPurchases: Array<{
    id: number;
    date: string;
    totalPence: number;
    voided: boolean;
    /**
     * The first allocation line as `Mobile Phones (Matthew)` — what the
     * payment was for and who it was for (decision 161). One supplier can hold
     * a contract per person, so without the target the rows are told apart by
     * amount alone. Empty only if a purchase somehow has no lines.
     */
    lineLabel: string;
    /** Lines beyond the first, shown as `+N more` exactly as All Transactions does. */
    extraLines: number;
    attachments: StoredAttachment[];
  }>;
}

/**
 * One interaction-log entry as the card prints it (SPEC §21.2, decision 175):
 * every line labelled — "Interaction:", "Logged by:", "Follow up by:" — so a
 * bare date can never be mistaken for the date of the call, the date it was
 * written down, or the date something is owed.
 */
export interface SupplierInteractionView {
  id: number;
  /** "Phone call", "Email", … */
  channelLabel: string;
  /** "Fri 27 Sep" (with the year when it is not this year). */
  occurredOnLabel: string;
  summary: string;
  outcome: string | null;
  loggedBy: string;
  /** The task this interaction's follow-up created, as it stands now. */
  followUp: {
    title: string;
    /** "Sun 1 Nov", or null for an undated follow-up. */
    dueDateLabel: string | null;
    /** "Overdue by 3 days", "In 12 days", "Done Tue 3 Nov", … */
    stateWords: string;
  } | null;
}

/** "2 open tasks · 1 overdue" — words, so the header never relies on colour. */
function TaskCountBadge({ openCount, overdueCount }: { openCount: number; overdueCount: number }) {
  if (openCount === 0) return null;
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${
        overdueCount > 0
          ? 'border-danger-300 bg-danger-50 text-danger-800'
          : 'border-border bg-surface-muted text-ink-body'
      }`}
    >
      {openCount} open {openCount === 1 ? 'task' : 'tasks'}
      {overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}
    </span>
  );
}

export function SupplierCard({
  supplier,
  references,
  interactions,
  tasks,
  documents,
  recentPurchases,
  isExpanded,
  onToggle,
}: SupplierCardData & {
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <article
      id={`supplier-${supplier.id}`}
      className="flex scroll-mt-24 flex-col rounded-xl border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={`supplier-details-${supplier.id}`}
        className="group flex w-full cursor-pointer items-center justify-between text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 rounded-lg"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-ink transition-colors group-hover:text-accent">
            {supplier.name}
          </h2>
          <TaskCountBadge openCount={tasks.openCount} overdueCount={tasks.overdueCount} />
        </span>
        <span
          className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors group-hover:bg-surface-muted group-hover:text-ink-body"
          aria-hidden="true"
        >
          {isExpanded ? (
            <ChevronUpIcon className="h-5 w-5" />
          ) : (
            <ChevronDownIcon className="h-5 w-5" />
          )}
        </span>
        <span className="sr-only">
          {isExpanded ? `Collapse ${supplier.name}` : `Expand ${supplier.name}`}
        </span>
      </button>

      {isExpanded ? (
        <div
          id={`supplier-details-${supplier.id}`}
          className="mt-4 border-t border-border-hairline pt-4"
        >
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="font-medium text-ink-muted">Phone</dt>
            <dd>
              {supplier.contactPhone !== null ? (
                <a
                  className="text-accent hover:underline"
                  href={`tel:${supplier.contactPhone.replace(/\s+/g, '')}`}
                >
                  {supplier.contactPhone}
                </a>
              ) : (
                '—'
              )}
            </dd>
            <dt className="font-medium text-ink-muted">Email</dt>
            <dd>
              {supplier.contactEmail !== null ? (
                <a className="text-accent hover:underline" href={`mailto:${supplier.contactEmail}`}>
                  {supplier.contactEmail}
                </a>
              ) : (
                '—'
              )}
            </dd>
            <dt className="font-medium text-ink-muted">Website</dt>
            <dd className="break-words">{supplier.website ?? '—'}</dd>
            <dt className="font-medium text-ink-muted">Address</dt>
            <dd className="whitespace-pre-line">{supplier.address ?? '—'}</dd>
          </dl>
          {supplier.notes !== null && supplier.notes !== '' ? (
            <p className="mt-3 whitespace-pre-line text-sm text-ink-soft">{supplier.notes}</p>
          ) : null}
          <SupplierContactForm
            supplier={{
              id: supplier.id,
              name: supplier.name,
              version: supplier.version,
              contactPhone: supplier.contactPhone,
              contactEmail: supplier.contactEmail,
              website: supplier.website,
              address: supplier.address,
              notes: supplier.notes,
            }}
          />

          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            References
          </h3>
          <SupplierReferenceForm supplierId={supplier.id} />
          {references.length > 0 ? (
            <ul className="text-sm">
              {references.map((reference) => (
                <li key={reference.id}>
                  <span className="font-medium">{reference.label}:</span> {reference.value}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">
              None recorded — policy or account numbers go here.
            </p>
          )}

          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Tasks
          </h3>
          <p className="mb-2 text-xs text-ink-muted">
            What you have said you will do about {supplier.name}. Tick one when it is done; an
            overdue task stays here until it is. In the app only — nothing is sent.
          </p>
          <OpenTaskList
            tasks={tasks.open}
            showSubject={false}
            emptyText="No open tasks for this supplier."
          />
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-medium text-ink-soft hover:text-ink">
              Add a task for {supplier.name}
            </summary>
            <div className="mt-2">
              <TaskCreateForm
                idPrefix={`supplier-${supplier.id}-task`}
                subject={`supplier:${supplier.id}`}
                titlePlaceholder="e.g. Research cheaper tariffs"
              />
            </div>
          </details>
          {tasks.doneRecently.length > 0 ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-ink-soft hover:text-ink">
                Done recently ({tasks.doneRecently.length})
              </summary>
              <div className="mt-2">
                <DoneTaskList tasks={tasks.doneRecently} showSubject={false} />
              </div>
            </details>
          ) : null}

          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Interaction log
          </h3>
          <SupplierInteractionForm supplierId={supplier.id} supplierName={supplier.name} />
          {interactions.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {interactions.map((interaction) => (
                <li key={interaction.id} className="border-l-2 border-note-200 pl-3">
                  <p>
                    <span className="font-medium">Interaction:</span> {interaction.occurredOnLabel}{' '}
                    · {interaction.channelLabel}
                  </p>
                  <p className="text-ink-body">{interaction.summary}</p>
                  {interaction.outcome !== null && interaction.outcome !== '' ? (
                    <p className="text-ink-muted">
                      <span className="font-medium">Outcome:</span> {interaction.outcome}
                    </p>
                  ) : null}
                  <p className="text-xs text-ink-muted">
                    <span className="font-medium">Logged by:</span> {interaction.loggedBy}
                  </p>
                  {interaction.followUp !== null ? (
                    <p className="text-xs text-ink-soft">
                      <span className="font-medium">Follow up by:</span>{' '}
                      {interaction.followUp.dueDateLabel ?? 'no date set'} —{' '}
                      {interaction.followUp.stateWords}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">No interactions yet.</p>
          )}

          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Documents
          </h3>
          <p className="text-xs text-ink-muted">
            Letters, policy documents and terms — PDF, JPEG or PNG, up to 10 MB each.
          </p>
          <AttachmentForm supplierId={supplier.id} attachments={documents} />

          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Recent purchases
          </h3>
          {recentPurchases.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {recentPurchases.map((purchase) => (
                <li key={purchase.id}>
                  <span className={purchase.voided ? 'text-ink-faint line-through' : ''}>
                    {purchase.date} · {formatPence(purchase.totalPence)}
                    {purchase.lineLabel === '' ? null : ` · ${purchase.lineLabel}`}
                  </span>
                  {purchase.extraLines > 0 ? (
                    <span className="ml-1 text-xs text-ink-muted">+{purchase.extraLines} more</span>
                  ) : null}
                  <AttachmentForm purchaseId={purchase.id} attachments={purchase.attachments} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">Nothing recorded against this supplier yet.</p>
          )}
        </div>
      ) : null}
    </article>
  );
}

/**
 * Bring a card into view under the sticky header. Smooth, unless the household
 * has asked the operating system for less motion.
 */
function scrollToSupplierCard(id: number): void {
  const card = document.getElementById(`supplier-${id}`);
  if (card === null) return;
  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}

export function SupplierCardList({
  cards,
  focus = null,
}: {
  cards: SupplierCardData[];
  /**
   * The supplier a "Supplier card" link asked for (decision 149), resolved
   * from the URL — or null on a plain visit, which behaves exactly as before.
   */
  focus?: SupplierFocus | null;
}) {
  const identities = useMemo(
    () => cards.map((card) => ({ id: card.supplier.id, name: card.supplier.name })),
    [cards],
  );
  const focusId = focus?.supplierId ?? null;
  const focusQuery = focus?.query ?? '';

  const [search, setSearch] = useState(focusQuery);
  const [expandedIds, setExpandedIds] = useState<Record<number, boolean>>(() =>
    focusId === null ? {} : { [focusId]: true },
  );
  // The focus the list is currently honouring. The server resolves the query
  // string; the fragment is resolved here on mount, because the browser never
  // sends it (and the v0.12.0 notes promised `/suppliers#supplier-3` works).
  const [target, setTarget] = useState<SupplierFocus>({ supplierId: focusId, query: focusQuery });

  useEffect(() => {
    if (window.location.hash === '') return;
    setTarget((current) =>
      hasSupplierFocus(current)
        ? current
        : resolveSupplierFocus({ hash: window.location.hash, suppliers: identities }),
    );
  }, [identities]);

  useEffect(() => {
    if (!hasSupplierFocus(target)) return;
    if (target.query !== '') setSearch(target.query);
    if (target.supplierId === null) return;
    const id = target.supplierId;
    setExpandedIds((prev) => ({ ...prev, [id]: true }));
    // After paint, so the expanded card is the thing that gets scrolled to.
    const timer = window.setTimeout(() => scrollToSupplierCard(id), 0);
    return () => window.clearTimeout(timer);
  }, [target]);

  const toggle = (id: number) => {
    setExpandedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const expandAll = () => {
    const next: Record<number, boolean> = {};
    for (const card of cards) {
      next[card.supplier.id] = true;
    }
    setExpandedIds(next);
  };

  const collapseAll = () => {
    setExpandedIds({});
  };

  const filteredCards = cards.filter((c) =>
    c.supplier.name.toLowerCase().includes(search.toLowerCase().trim()),
  );

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <label htmlFor="supplier-search" className="sr-only">
            Filter suppliers
          </label>
          <input
            id="supplier-search"
            type="search"
            placeholder="Filter suppliers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-sm placeholder:text-ink-faint focus:border-border-emphasis focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-ink-soft">
          <button
            type="button"
            onClick={expandAll}
            className="rounded px-2.5 py-1 hover:bg-surface-sunk cursor-pointer"
          >
            Expand all
          </button>
          <span className="text-ink-ghost" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            onClick={collapseAll}
            className="rounded px-2.5 py-1 hover:bg-surface-sunk cursor-pointer"
          >
            Collapse all
          </button>
        </div>
      </div>

      {filteredCards.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-sm text-ink-muted">
          No suppliers match “{search}”.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {filteredCards.map((card) => (
            <SupplierCard
              key={card.supplier.id}
              {...card}
              isExpanded={Boolean(expandedIds[card.supplier.id])}
              onToggle={() => toggle(card.supplier.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
