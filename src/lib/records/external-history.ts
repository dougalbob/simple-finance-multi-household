import { formatPence } from '../money';
import { describeExternalMovement, type ExternalMovement } from './external-movements';

/**
 * The boundary history on Accounts, Pots & Checkpoints (SPEC §10.2, GitHub
 * issue #65): swaps and other money in one newest-first feed, with a swap's
 * two legs **nested into one object** so the pair reads as the single record
 * it actually is, rather than as two unrelated rows that happen to share a
 * date. This module is pure view code: the page reads the rows, the component
 * draws them, and everything decided here — grouping, ordering, the wording of
 * a leg, the pair's honest net — is testable without a browser.
 *
 * Loans are not this list's business: borrowing and repayments live on the
 * Borrowing page (decision 228), so `buildExternalHistory` drops them and the
 * page's own filter is a belt-and-braces second.
 */

/**
 * The id the history panel carries, so a pot card's "Recent swaps involving
 * …" link and All Transactions' "Open the swap list" land on the very panel
 * that now holds every swap. (`#swaps` stays on the record-swap card.)
 */
export const SWAP_HISTORY_ANCHOR = 'swap-history';

/** A fetch window wide enough that the entries actually drawn are whole pairs. */
export const EXTERNAL_HISTORY_FETCH_LIMIT = 60;

/** How many history entries the panel renders. */
export const EXTERNAL_HISTORY_DISPLAY_LIMIT = 20;

/** One swap — both legs of the pair, or the honest remains of one. */
export interface SwapHistoryEntry {
  kind: 'swap';
  /** React key and DOM id stem: `swap-{exchangeKey}`. */
  key: string;
  exchangeKey: string;
  inLeg: ExternalMovement | null;
  outLeg: ExternalMovement | null;
  /** The newest leg's instant — where the object sorts among other money. */
  sortAt: number;
  /** Tie-break on the newest leg's id, matching the list's own order. */
  sortId: number;
}

/** One loan-free boundary record: other money in or out. */
export interface MovementHistoryEntry {
  kind: 'movement';
  /** React key and DOM id stem: `external-{id}`. */
  key: string;
  movement: ExternalMovement;
  sortAt: number;
  sortId: number;
}

export type ExternalHistoryEntry = SwapHistoryEntry | MovementHistoryEntry;

/** Every movement id an entry speaks for — a pair speaks for both its legs. */
export function entryMovementIds(entry: ExternalHistoryEntry): number[] {
  if (entry.kind === 'movement') return [entry.movement.id];
  return [entry.inLeg?.id, entry.outLeg?.id].filter((id): id is number => id !== undefined);
}

/** The first leg of a pair, whichever leg the household actually recorded. */
export function leadingLeg(entry: SwapHistoryEntry): ExternalMovement | null {
  return entry.inLeg ?? entry.outLeg;
}

/** The second, nested leg — the one the pointer arrow introduces. */
export function nestedLeg(entry: SwapHistoryEntry): ExternalMovement | null {
  return entry.inLeg === null ? null : entry.outLeg;
}

/**
 * The newest-first feed: swap legs folded into their pair (by exchange key),
 * other money left as itself, loans dropped. Ordering matches the records
 * layer's own (`occurredAt` then `id`, both descending), a pair sorting where
 * its newest leg sorts, so a swap sits among the other money on the date the
 * household remembers it by.
 *
 * A pair whose partner is not in `movements` keeps its missing leg as `null`
 * rather than inventing one — the honest half-pair. In practice the page
 * fetches `EXTERNAL_HISTORY_FETCH_LIMIT` rows and draws 20 entries, so a pair
 * is never split by the limit; a swap leg is only ever missing from the
 * database if the whole row is (legs are written and voided, never deleted).
 *
 * `pinnedId` names the record a deep link asked for (`?external={id}`): its
 * entry is moved to the front, where the page's "showing the record you linked
 * to" note speaks for it, instead of the household hunting through twenty rows
 * for something older than the window. The pinned record's partner, if it is
 * in `movements`, rides with it.
 */
export function buildExternalHistory(
  movements: readonly ExternalMovement[],
  options: { pinnedId?: number | null } = {},
): ExternalHistoryEntry[] {
  const entries = groupExternalHistory(movements);
  const pinnedId = options.pinnedId ?? null;
  if (pinnedId !== null) {
    const at = entries.findIndex((entry) => entryMovementIds(entry).includes(pinnedId));
    if (at > 0) entries.unshift(...entries.splice(at, 1));
  }
  return entries;
}

function groupExternalHistory(movements: readonly ExternalMovement[]): ExternalHistoryEntry[] {
  const pairs = new Map<string, SwapHistoryEntry>();
  const entries: ExternalHistoryEntry[] = [];
  for (const movement of movements) {
    if (movement.kind === 'loan') continue;
    if (movement.kind === 'swap' && movement.exchangeKey !== null) {
      const exchangeKey = movement.exchangeKey;
      let entry = pairs.get(exchangeKey);
      if (entry === undefined) {
        entry = {
          kind: 'swap',
          key: `swap-${exchangeKey}`,
          exchangeKey,
          inLeg: null,
          outLeg: null,
          sortAt: movement.occurredAt.getTime(),
          sortId: movement.id,
        };
        pairs.set(exchangeKey, entry);
        entries.push(entry);
      }
      if (movement.direction === 'in') entry.inLeg = entry.inLeg ?? movement;
      else entry.outLeg = entry.outLeg ?? movement;
      entry.sortAt = Math.max(entry.sortAt, movement.occurredAt.getTime());
      entry.sortId = Math.max(entry.sortId, movement.id);
      continue;
    }
    entries.push({
      kind: 'movement',
      key: `external-${movement.id}`,
      movement,
      sortAt: movement.occurredAt.getTime(),
      sortId: movement.id,
    });
  }
  // Newest first; a same-instant tie goes to the newest id, as the records
  // layer orders them (`desc(occurredAt), desc(id)`).
  return entries.sort((a, b) => b.sortAt - a.sortAt || b.sortId - a.sortId);
}

/** `+£40.00` / `−£40.00`; a balanced pair simply reads `£0.00`. */
export function formatNetPence(netPence: number): string {
  if (netPence === 0) return formatPence(0);
  return `${netPence > 0 ? '+' : '−'}${formatPence(Math.abs(netPence))}`;
}

export type SwapPairTone = 'balanced' | 'warning' | 'voided';

export interface SwapPairStatus {
  /** How many legs the household can still count. */
  liveLegs: number;
  /** Live money in minus live money out — £0.00 for an untouched pair. */
  netPence: number;
  /** The word on the pair's badge. */
  label: string;
  tone: SwapPairTone;
}

/**
 * The pair's honest state in one badge, carried over from the retired
 * "Recent swaps" list so the conclusion cannot change with the layout: a
 * balanced live pair reads **net £0.00** (green), a pair whose legs no longer
 * match — one leg corrected, or one leg voided on its own — says so with the
 * live net in amber, and a pair voided whole reads **voided** in grey. The net
 * only ever counts live legs, so a half-voided pair reads the difference
 * rather than pretending to balance.
 */
export function swapPairStatus(entry: SwapHistoryEntry): SwapPairStatus {
  const inLive = entry.inLeg !== null && entry.inLeg.voidedAt === null;
  const outLive = entry.outLeg !== null && entry.outLeg.voidedAt === null;
  const netPence =
    (inLive ? (entry.inLeg?.amountPence ?? 0) : 0) -
    (outLive ? (entry.outLeg?.amountPence ?? 0) : 0);
  const liveLegs = (inLive ? 1 : 0) + (outLive ? 1 : 0);
  if (liveLegs === 0) {
    return { liveLegs, netPence: 0, label: 'voided', tone: 'voided' };
  }
  if (liveLegs === 1) {
    return {
      liveLegs,
      netPence,
      label: `one leg voided · net ${formatNetPence(netPence)}`,
      tone: 'warning',
    };
  }
  return netPence === 0
    ? { liveLegs, netPence, label: 'net £0.00', tone: 'balanced' }
    : {
        liveLegs,
        netPence,
        label: `legs differ · net ${formatNetPence(netPence)}`,
        tone: 'warning',
      };
}

/**
 * One swap leg in the household's own words (issue #65):
 * `Swap in £40.00 from Sam · into Alex's cash` and
 * `Swap out £40.00 to Sam · from Main account`. Direction is spelled out
 * rather than shown as a bare sign, the counterparty is named, and the pot is
 * said with its preposition — which pot the money arrived in, which pot it
 * left — so the two legs read as one movement of money rather than as two
 * unrelated adjustments.
 */
export function describeSwapLeg(leg: ExternalMovement, potLabel: string | null): string {
  const amount = formatPence(leg.amountPence);
  const pot = potLabel ?? '—';
  return leg.direction === 'in'
    ? `Swap in ${amount} from ${leg.counterparty} · into ${pot}`
    : `Swap out ${amount} to ${leg.counterparty} · from ${pot}`;
}

/**
 * One other-money row, said the same way: `Received £25.00 from the neighbour
 * · into Main account`. A loan falls back to the shared wording — it should
 * never reach this list (decision 228), but a wrong list is not a reason for a
 * blank row.
 */
export function describeBoundaryMovement(
  movement: ExternalMovement,
  potLabel: string | null,
): string {
  if (movement.kind === 'loan') return describeExternalMovement(movement);
  const amount = formatPence(movement.amountPence);
  const pot = potLabel ?? '—';
  if (movement.kind === 'swap') return describeSwapLeg(movement, potLabel);
  return movement.direction === 'in'
    ? `Received ${amount} from ${movement.counterparty} · into ${pot}`
    : `Paid ${amount} to ${movement.counterparty} · from ${pot}`;
}
