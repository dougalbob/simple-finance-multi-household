'use client';

import Link from 'next/link';
import { Fragment, useEffect, useRef } from 'react';
import {
  ACTIVITY_TABLE_ID,
  ActivityPanel,
  useActivityRow,
  useKeepPinnedPanelInView,
  useRowToggleReady,
} from '@/components/activity-open-row';
import { AttachmentForm } from '@/components/attachment-form';
import { PurchaseEditForm, VoidForm, type EntryLineState } from '@/components/record-forms';
import { formatPence } from '@/lib/money';
import type { ActivityLink, ActivityRow } from '@/lib/records/activity';
import type { ActivityWindow } from '@/lib/records/in-place-activity';
import type { PinnedPurchaseReason } from '@/lib/records/purchase-activity';

export interface PinnedPurchaseView {
  reason: PinnedPurchaseReason;
  /** Where the purchase can be seen as a live row again — a window that holds its date, or Purchases. */
  links: ActivityLink[];
}

export interface PurchaseActivityRowProps {
  row: ActivityRow;
  /** The pot the page is showing. */
  potLabel: string;
  /** The window the page is showing. */
  dates: ActivityWindow;
  today: string;
  /** The Purchases editor's own options: live leaf categories (SPEC §12). */
  categories: Array<{ id: number; parentName: string; childName: string }>;
  people: Array<{ id: number; label: string }>;
  vehicles: Array<{ id: number; label: string }>;
  /** Alternating rows (decision 208): this movement takes the tinted turn. */
  striped: boolean;
  /** Set when the open purchase no longer counts in this list (decision 226). */
  pinned: PinnedPurchaseView | null;
  /** A document id to land on, from the Documents search (v1.41.0). */
  focusAttachmentId: number | null;
}

const BADGE: Record<PinnedPurchaseReason, string> = {
  voided: 'voided — not counted',
  'outside-window': 'outside these dates — not counted',
  hidden: 'past the row limit — not counted',
};

/** The noun the panel's heading uses for each classification (SPEC §15.3). */
function codeLabel(code: ActivityRow['code']): string {
  if (code === 'DD') return 'Direct debit';
  if (code === 'SO') return 'Standing order';
  if (code === 'REF') return 'Refund';
  return 'Purchase';
}

/** `12.34` from stored pence — the amount text the editor's lines start from. */
const amountText = (pence: number): string => {
  const abs = Math.abs(pence);
  return `${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
};

/**
 * One purchase in All Transactions, opened in place (decision 226, GitHub issue
 * #57). The supplier's name — or the schedule's, when the record has no
 * supplier — is the way in: selecting it opens a panel directly beneath the
 * row holding the purchase's own correction form (the Purchases page's
 * `PurchaseEditForm`, untouched) and its void form. `PUR` (recorded by hand),
 * `DD` and `SO` (converted from a schedule) all open this way; a refund keeps
 * its link to Purchases, beside the original it was refunded against.
 *
 * Which record is open — and the URL, optimistic state and shared panel frame
 * that follow from it — belongs to `ActivityOpenRowProvider`
 * (`activity-open-row.tsx`); this component draws the purchase's own row and
 * forms. The toggle follows the Horizon breakdown cells (decision 203): drawn
 * as a link, with a dotted underline that says "this opens here".
 */
export function PurchaseActivityRow({
  row,
  potLabel,
  dates,
  today,
  categories,
  people,
  vehicles,
  striped,
  pinned,
  focusAttachmentId,
}: PurchaseActivityRowProps) {
  const purchaseId = row.recordId;
  const { open, openRow, closeRow } = useActivityRow();
  const isOpen = open?.kind === 'purchase' && open.id === purchaseId;
  const ready = useRowToggleReady();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const openedByClick = useRef(false);
  const panelId = `purchase-${purchaseId}-panel`;
  const facts = row.purchase;

  useEffect(() => {
    if (!isOpen || !openedByClick.current) return;
    openedByClick.current = false;
    // A row near the bottom of the screen would open its panel out of
    // sight; `nearest` scrolls only as far as needed, and not at all when
    // the panel is already in view.
    panelRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isOpen]);

  useKeepPinnedPanelInView(pinned !== null, panelRef);

  if (facts === null) return null;
  // A pinned row exists only because this purchase is open: once the household
  // closes it, it goes — the next server render would drop it too.
  if (pinned !== null && !isOpen) return null;

  const close = () => {
    closeRow();
    if (pinned === null) {
      toggleRef.current?.focus();
    } else {
      // The row leaves with the panel; keep the keyboard in the table.
      document.getElementById(ACTIVITY_TABLE_ID)?.focus({ preventScroll: true });
    }
  };

  const voided = facts.voidReason !== null;
  const incoming = row.direction === 'in';
  const amount = `${incoming ? '+' : '−'}${formatPence(row.amountPence)}`;
  const balance = pinned === null ? row.runningBalancePence : null;
  const fromSchedule = row.code === 'DD' || row.code === 'SO';
  const rowTint = isOpen
    ? pinned === null
      ? 'bg-accent-50'
      : 'bg-surface-muted'
    : striped
      ? 'bg-canvas'
      : '';
  // The editor starts from the record as saved: the amount on each line in the
  // household's own pounds-and-pence, the category it was filed under and the
  // person or vehicle it was for (the Purchases page's own line state).
  const lines: EntryLineState[] = facts.lines.map((line) => ({
    amount: amountText(line.amountPence),
    categoryId: line.categoryId,
    targetKind: line.targetKind,
    targetId: line.targetId,
  }));

  return (
    <Fragment>
      <tr
        id={`purchase-${purchaseId}`}
        className={`sf-anchor border-t border-border-hairline align-top ${rowTint} ${
          pinned !== null ? 'text-ink-muted' : ''
        }`}
      >
        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-ink-body">{row.date}</td>
        <td className="whitespace-nowrap px-3 py-2.5">
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold tracking-wide text-ink-body">
            {row.code}
          </span>
          {row.secondaryLink !== null ? (
            <Link href={row.secondaryLink.href} className="ml-2 text-xs sf-link">
              {row.secondaryLink.label}
            </Link>
          ) : null}
          {pinned !== null ? (
            <span className="mt-1 block text-xs font-medium text-ink-muted">
              {BADGE[pinned.reason]}
            </span>
          ) : null}
          {row.badge !== null ? (
            <span className="mt-1 block text-xs font-medium text-ink-soft">{row.badge}</span>
          ) : null}
        </td>
        <td className="px-3 py-2.5">
          <button
            ref={toggleRef}
            type="button"
            onClick={() => {
              if (isOpen) {
                close();
                return;
              }
              openedByClick.current = true;
              openRow('purchase', purchaseId);
            }}
            aria-expanded={isOpen}
            aria-controls={isOpen ? panelId : undefined}
            data-purchase-ready={ready ? 'true' : 'false'}
            inert={!ready}
            className={`sf-link -mx-1 rounded px-1 text-left decoration-dotted focus-visible:outline-2 focus-visible:outline-accent aria-expanded:font-semibold ${
              voided ? 'line-through' : ''
            }`}
          >
            {row.source}
            {/* inline-block: the link underline does not run under the marker. */}
            <span aria-hidden="true" className="ml-1 inline-block text-[0.7em] no-underline">
              {isOpen ? '▾' : '▸'}
            </span>
            <span className="sr-only">
              {' '}
              — {isOpen ? 'Close this purchase' : 'Open this purchase'}
            </span>
          </button>
        </td>
        <td className="px-3 py-2.5 text-ink-soft">
          {row.category === '' ? <span className="text-ink-faint">—</span> : row.category}
          {row.extraLines > 0 ? (
            <span className="ml-1 text-xs text-ink-muted">+{row.extraLines} more</span>
          ) : null}
        </td>
        <td
          className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums ${
            pinned !== null ? 'text-ink-faint' : incoming ? 'text-positive' : 'text-danger'
          } ${voided ? 'line-through' : ''}`}
        >
          {amount}
        </td>
        <td className="px-3 py-2.5 text-ink-soft">
          {row.note === '' ? <span className="text-ink-faint">—</span> : row.note}
        </td>
        <td
          className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums ${
            balance === null ? 'text-ink-faint' : balance >= 0 ? 'text-positive' : 'text-danger'
          }`}
        >
          {balance === null ? <span className="text-ink-faint">—</span> : formatPence(balance)}
        </td>
      </tr>
      {isOpen ? (
        <ActivityPanel
          id={panelId}
          panelRef={panelRef}
          muted={pinned !== null}
          onClose={close}
          title={
            <>
              {codeLabel(row.code)} #{purchaseId} · {row.source}
            </>
          }
          subtitle={
            <>
              {formatPence(row.amountPence)} on {row.date} · recorded by {facts.enteredBy} ·{' '}
              {fromSchedule
                ? `a payment the schedule made itself — correcting it here never rewrites the schedule`
                : `money out of ${potLabel}, never a movement between your own pots`}
            </>
          }
        >
          <PinnedNotice
            pinned={pinned}
            potLabel={potLabel}
            dates={dates}
            date={row.date}
            voidReason={facts.voidReason}
          />
          {row.badge !== null ? (
            <p
              role="status"
              className="mt-3 rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-sm text-ink-body"
            >
              <strong>{row.badge}.</strong> The refund records and the amount still refundable are
              shown with this purchase on{' '}
              <Link href={row.link.href} className="sf-link">
                Purchases
              </Link>
              .
            </p>
          ) : null}
          {voided ? null : (
            <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-ink">Correct it</h4>
                <p className="mb-2 mt-0.5 text-xs text-ink-muted">
                  {fromSchedule
                    ? 'The wrong amount, category or date, or a note to add — fixed in place, with the before and after kept in the history. The schedule keeps making these; only this record changes.'
                    : 'The wrong amount, category or date, or a note to add — fixed in place, with the before and after kept in the history. Use Void instead when the record should not exist at all.'}
                </p>
                <PurchaseEditForm
                  purchaseId={purchaseId}
                  expectedVersion={facts.version}
                  occurredDate={row.date}
                  note={facts.note ?? ''}
                  paidVia={facts.paidVia ?? ''}
                  lines={lines}
                  categories={categories}
                  people={people}
                  vehicles={vehicles}
                />
                <AttachmentForm
                  purchaseId={purchaseId}
                  attachments={facts.attachments}
                  focusId={focusAttachmentId}
                />
              </div>
              <div className="min-w-0 md:border-l md:border-border-hairline md:pl-6">
                <h4 className="text-sm font-semibold text-ink">Void it</h4>
                <p className="mb-2 mt-0.5 text-xs text-ink-muted">
                  Only for a purchase that should not exist at all — a duplicate, or spending that
                  never happened. Voiding keeps the record and your reason; nothing is deleted.
                </p>
                <VoidForm
                  kind="purchase"
                  recordId={purchaseId}
                  expectedVersion={facts.version}
                  summary={`${row.source}, ${formatPence(row.amountPence)}`}
                />
              </div>
            </div>
          )}
        </ActivityPanel>
      ) : null}
    </Fragment>
  );
}

/** Why a pinned purchase no longer counts here, and where it does — in the household's words. */
function PinnedNotice({
  pinned,
  potLabel,
  dates,
  date,
  voidReason,
}: {
  pinned: PinnedPurchaseView | null;
  potLabel: string;
  dates: ActivityWindow;
  date: string;
  voidReason: string | null;
}) {
  if (pinned === null) return null;
  const links =
    pinned.links.length === 0 ? null : (
      <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {pinned.links.map((link) => (
          <Link key={link.href} href={link.href} className="sf-link-arrow">
            {link.label} →
          </Link>
        ))}
      </span>
    );
  const message =
    pinned.reason === 'voided' ? (
      <>
        <span className="font-semibold">Voided</span>
        {voidReason !== null && voidReason !== '' ? <> — “{voidReason}”</> : null}. It no longer
        counts anywhere: not in {potLabel}&apos;s balance, and not in this list or its totals. The
        record and the reason are kept on Purchases. Close this panel and the row goes.
      </>
    ) : pinned.reason === 'outside-window' ? (
      <>
        It is now dated {date}, outside {dates.dateFrom} to {dates.dateTo}, so it has left this
        list. It stays here until you close it, so you can still put it right.
      </>
    ) : (
      <>
        It falls past the newest rows this page shows for {dates.dateFrom} to {dates.dateTo}, so it
        is not in the list or its totals. Narrow the dates to see it in place.
      </>
    );
  return (
    <p
      role="status"
      className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
        pinned.reason === 'voided'
          ? 'border-border-strong bg-surface-muted text-ink-body'
          : 'border-warning-300 bg-warning-50 text-warning-900'
      }`}
    >
      {message}
      {links}
    </p>
  );
}
