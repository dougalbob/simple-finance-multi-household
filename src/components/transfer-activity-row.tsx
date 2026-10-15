'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  Fragment,
  startTransition,
  use,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { TransferEditForm, VoidForm } from '@/components/record-forms';
import { formatPence } from '@/lib/money';
import type { ActivityLink, ActivityRow } from '@/lib/records/activity';
import {
  OPEN_TRANSFER_PARAM,
  parseOpenTransferId,
  type ActivityWindow,
  type PinnedTransferReason,
} from '@/lib/records/transfer-activity';

/** The All Transactions table's column count — the panel row spans all of them. */
const ACTIVITY_COLUMN_COUNT = 7;

/** Where the table's focus goes when a pinned row closes and takes its own button with it. */
export const ACTIVITY_TABLE_ID = 'activity-table';

export interface PinnedTransferView {
  reason: PinnedTransferReason;
  /** Where the transfer is a live row again: its pots' activity, or a window that holds its date. */
  links: ActivityLink[];
}

export interface TransferActivityRowProps {
  row: ActivityRow;
  /** The pot the page is showing. */
  potId: number;
  potLabel: string;
  /** The window the page is showing. */
  dates: ActivityWindow;
  /** The household's live pots, for the editor's From / To pickers. */
  pots: Array<{ id: number; label: string }>;
  today: string;
  /** Alternating rows (decision 208): this movement takes the tinted turn. */
  striped: boolean;
  /** Set when the open transfer no longer counts in this list (decision 225). */
  pinned: PinnedTransferView | null;
}

interface OpenTransferState {
  /** The transfer whose panel is open — at most one on the page. */
  openId: number | null;
  setOpenId: (transferId: number | null) => void;
}

const OpenTransferContext = createContext<OpenTransferState | null>(null);

/**
 * Which transfer is open, shared by every transfer row in the table so that
 * opening one closes the other at once. The truth is the URL's
 * `?transfer={id}`; opening and closing replace the URL through the router
 * (`scroll: false`, no new history entry), so the page the server renders —
 * including the one it renders after a save — always knows which transfer
 * is open. A server round trip should not make a click feel slow, so the
 * new state shows optimistically while that navigation completes.
 *
 * Why not `history.replaceState`, which would skip the round trip: Next's
 * router would then hold the old query while the URL held the new one, and
 * the first save after opening would come back as a "different" page and
 * scroll the household away from the panel they were using.
 */
export function OpenTransferProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlOpenId = parseOpenTransferId(searchParams.get(OPEN_TRANSFER_PARAM) ?? undefined);
  const [openId, setOptimisticOpenId] = useOptimistic(urlOpenId);
  const setOpenId = (transferId: number | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (transferId === null) params.delete(OPEN_TRANSFER_PARAM);
    else params.set(OPEN_TRANSFER_PARAM, String(transferId));
    const query = params.toString();
    // The fragment lets a refresh (or a shared link) land on the open row.
    const fragment = transferId === null ? '' : `#transfer-${transferId}`;
    startTransition(() => {
      setOptimisticOpenId(transferId);
      router.replace(`${pathname}${query === '' ? '' : `?${query}`}${fragment}`, {
        scroll: false,
      });
    });
  };
  return (
    <OpenTransferContext.Provider value={{ openId, setOpenId }}>
      {children}
    </OpenTransferContext.Provider>
  );
}

function useOpenTransfer(): OpenTransferState {
  const state = use(OpenTransferContext);
  if (state === null) {
    throw new Error('TransferActivityRow must be rendered inside an OpenTransferProvider');
  }
  return state;
}

const BADGE: Record<PinnedTransferReason, string> = {
  voided: 'voided — not counted',
  elsewhere: 'moved to other pots — not counted',
  'outside-window': 'outside these dates — not counted',
  hidden: 'past the row limit — not counted',
};

/**
 * One internal transfer in All Transactions, opened in place (decision 225,
 * GitHub issue #55). The other pot's name is the way in: selecting it opens a
 * panel directly beneath the row with the transfer's correction form and its
 * void form, so the household never leaves the list they were reading. Only
 * transfers between the household's own pots behave this way — every other
 * row keeps its link to the page that owns it.
 *
 * The open transfer is the URL's `?transfer={id}`, one at a time
 * (`OpenTransferProvider`): opening and closing adds no history entries, a
 * refresh keeps the panel open, and — because Next sends a server action to
 * the current URL — the page re-rendered after a save still knows which
 * transfer is open. That is what lets the server keep a voided or moved
 * transfer on screen as a pinned row (`pinned`) instead of pulling the panel
 * out from under the household; closing it lets it go.
 *
 * The toggle follows the Horizon breakdown cells (decision 203): drawn as a
 * link, with a dotted underline that says "this opens here".
 */
export function TransferActivityRow({
  row,
  potId,
  potLabel,
  dates,
  pots,
  today,
  striped,
  pinned,
}: TransferActivityRowProps) {
  const transferId = row.recordId;
  const { openId, setOpenId } = useOpenTransfer();
  const open = openId === transferId;
  /**
   * The decision 131 rule (SPEC §15.1): before React hydrates this row, a
   * click would open nothing — so the toggle is `inert` until it can hear,
   * and says so with `data-transfer-ready`.
   */
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const openedByClick = useRef(false);
  const panelId = `transfer-${transferId}-panel`;
  const facts = row.transfer;

  useEffect(() => {
    if (!open || !openedByClick.current) return;
    openedByClick.current = false;
    // A row near the bottom of the screen would open its panel out of
    // sight; `nearest` scrolls only as far as needed, and not at all when
    // the panel is already in view.
    panelRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open]);

  if (facts === null) return null;
  // A pinned row exists only because this transfer is open: once the
  // household closes it, it goes — the next server render would drop it too.
  if (pinned !== null && !open) return null;

  const close = () => {
    setOpenId(null);
    if (pinned === null) {
      toggleRef.current?.focus();
    } else {
      // The row leaves with the panel; keep the keyboard in the table.
      document.getElementById(ACTIVITY_TABLE_ID)?.focus({ preventScroll: true });
    }
  };

  const voided = facts.voidReason !== null;
  // Corrected onto two other pots (or opened from a pot it never touched):
  // there is no "in" or "out" from this pot's point of view, so the row names
  // both pots and the amount carries no sign.
  const offPot = facts.fromPotId !== potId && facts.toPotId !== potId;
  const incoming = row.direction === 'in';
  const amountText = offPot
    ? formatPence(row.amountPence)
    : `${incoming ? '+' : '−'}${formatPence(row.amountPence)}`;
  const balance = pinned === null ? row.runningBalancePence : null;
  const rowTint = open
    ? pinned === null
      ? 'bg-accent-50'
      : 'bg-surface-muted'
    : striped
      ? 'bg-canvas'
      : '';

  return (
    <Fragment>
      <tr
        id={`transfer-${transferId}`}
        className={`sf-anchor border-t border-border-hairline align-top ${rowTint} ${
          pinned !== null ? 'text-ink-muted' : ''
        }`}
      >
        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-ink-body">{row.date}</td>
        <td className="whitespace-nowrap px-3 py-2.5">
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold tracking-wide text-ink-body">
            {offPot ? 'TX' : row.code}
          </span>
          {pinned !== null ? (
            <span className="mt-1 block text-xs font-medium text-ink-muted">
              {BADGE[pinned.reason]}
            </span>
          ) : null}
        </td>
        <td className="px-3 py-2.5">
          <button
            ref={toggleRef}
            type="button"
            onClick={() => {
              if (open) {
                close();
                return;
              }
              openedByClick.current = true;
              setOpenId(transferId);
            }}
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            data-transfer-ready={ready ? 'true' : 'false'}
            inert={!ready}
            className={`sf-link -mx-1 rounded px-1 text-left decoration-dotted focus-visible:outline-2 focus-visible:outline-accent aria-expanded:font-semibold ${
              voided ? 'line-through' : ''
            }`}
          >
            {offPot ? `${facts.fromLabel} → ${facts.toLabel}` : row.source}
            {/* inline-block: the link underline does not run under the marker. */}
            <span aria-hidden="true" className="ml-1 inline-block text-[0.7em] no-underline">
              {open ? '▾' : '▸'}
            </span>
            <span className="sr-only">
              {' '}
              — {open ? 'Close this transfer' : 'Open this transfer'}
            </span>
          </button>
        </td>
        <td className="px-3 py-2.5 text-ink-faint">—</td>
        <td
          className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums ${
            pinned !== null ? 'text-ink-faint' : incoming ? 'text-positive' : 'text-danger'
          } ${voided ? 'line-through' : ''}`}
        >
          {amountText}
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
      {open ? (
        <tr className={pinned === null ? 'bg-accent-50/40' : 'bg-surface-muted/60'}>
          <td colSpan={ACTIVITY_COLUMN_COUNT} className="px-3 pb-4 pt-1">
            {/* Pinned to the visible width, as the Horizon breakdown is: the
                table scrolls sideways on a phone, and the panel must not run
                off the right-hand edge. */}
            <div className="sticky left-0 w-[min(calc(100vw-4rem),100%)]">
              <section
                ref={panelRef}
                id={panelId}
                aria-labelledby={`${panelId}-heading`}
                className="rounded-xl border border-border bg-surface p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 id={`${panelId}-heading`} className="text-base font-semibold text-ink">
                      Transfer #{transferId} · {facts.fromLabel} → {facts.toLabel}
                    </h3>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {formatPence(row.amountPence)} on {row.date} · recorded by {facts.enteredBy} ·
                      money moving between your own pots, never spending
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded border border-border-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink-body hover:bg-canvas"
                  >
                    Close
                  </button>
                </div>
                <PinnedNotice
                  pinned={pinned}
                  potLabel={potLabel}
                  dates={dates}
                  date={row.date}
                  amountPence={row.amountPence}
                  fromLabel={facts.fromLabel}
                  toLabel={facts.toLabel}
                  voidReason={facts.voidReason}
                />
                {voided ? null : (
                  <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-ink">Correct it</h4>
                      <p className="mb-2 mt-0.5 text-xs text-ink-muted">
                        A wrong pot, amount or date, or a note to add — fixed in place, with the
                        before and after kept in the history.
                      </p>
                      <TransferEditForm
                        idPrefix={`transfer-edit-${transferId}`}
                        transferId={transferId}
                        expectedVersion={facts.version}
                        fromPotId={facts.fromPotId}
                        toPotId={facts.toPotId}
                        amountPence={row.amountPence}
                        occurredDate={row.date}
                        note={facts.note}
                        pots={pots}
                        today={today}
                      />
                    </div>
                    <div className="min-w-0 md:border-l md:border-border-hairline md:pl-6">
                      <h4 className="text-sm font-semibold text-ink">Void it</h4>
                      <p className="mb-2 mt-0.5 text-xs text-ink-muted">
                        Only for a transfer that should not exist at all. Voiding keeps the record
                        and your reason; nothing is deleted.
                      </p>
                      <VoidForm
                        kind="transfer"
                        recordId={transferId}
                        expectedVersion={facts.version}
                        summary={`${facts.fromLabel} → ${facts.toLabel}, ${formatPence(row.amountPence)}`}
                      />
                    </div>
                  </div>
                )}
              </section>
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

/** Why a pinned transfer no longer counts here, and where it does — in the household's words. */
function PinnedNotice({
  pinned,
  potLabel,
  dates,
  date,
  amountPence,
  fromLabel,
  toLabel,
  voidReason,
}: {
  pinned: PinnedTransferView | null;
  potLabel: string;
  dates: ActivityWindow;
  date: string;
  amountPence: number;
  fromLabel: string;
  toLabel: string;
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
        counts anywhere: not in either pot&apos;s estimate, and not in this list or its totals. The
        record and the reason are kept. Close this panel and the row goes.
      </>
    ) : pinned.reason === 'elsewhere' ? (
      <>
        It now moves {formatPence(amountPence)} from {fromLabel} to {toLabel}, so it no longer
        touches {potLabel} and has left this list. It stays here until you close it, so you can
        still put it right.
      </>
    ) : pinned.reason === 'outside-window' ? (
      <>
        It is now dated {date}, outside {dates.dateFrom} to {dates.dateTo}, so it has left this
        list. It stays here until you close it.
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
