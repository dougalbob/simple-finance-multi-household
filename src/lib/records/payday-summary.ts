import { formatPence } from '../money';
import { formatDayMonthLocalDate, toLocalDateString } from '../time';
import { addDaysLocal } from './dates';
import type { ProjectionView } from './money-view';
import type { ScheduleKind } from './schedules';

/**
 * The payday summary (v0.37.0 follow-up, decision 187): the short,
 * plain-English card the household asked for on the phone home. The day-by-day
 * table, projected shops/fills, expected-support list and weekly pace live on
 * Horizon; the card keeps four facts and links there:
 *
 *     Next pay day is 26th October (18 days from today)
 *     Based on a current household balance of £242.22 in bank and cash pots
 *     and no additional unplanned spending, the household low would reach
 *     -£165.25.
 *     Plan a transfer? Natwest has the worst bills-only shortfall: £850.00
 *     (upcoming Direct Debits next due 21st October — Council tax, Mortgage
 *     and Water Bill). Aim to transfer at least £850.00 into Natwest by
 *     16th October.
 *
 * When day-to-day projection is positive, the transfer line adds a separate
 * named-pot guide, explicitly not a strict allocation. Pure and framework-
 * free: the wording is pinned in Node, so a number that moves is a failed
 * test rather than a sentence nobody re-read.
 */

/**
 * How long before the earliest bill a transfer should land (decision 186).
 * The household picked a fixed five days: the money must be in the account
 * before the direct debit is taken, not on the day.
 */
export const TRANSFER_LEAD_DAYS = 5;

/** Longer lists hurt more than they help on a phone — name three and count the rest. */
const MAX_LISTED_BILLS = 3;

export interface PaydayTransferWatch {
  potId: number;
  potLabel: string;
  /** How far short of its own bills this pot would be (always positive here). */
  shortfallPence: number;
  /** The pot's reported/projected balance; read only when nothing is dated. */
  estimatePence: number;
  /** The pot's earliest bill in the window; null when it has none left. */
  earliestDueDate: string | null;
  /** The bills due on that earliest date, in the order the engine holds them. */
  earliestCommitments: ReadonlyArray<{ name: string; amountPence: number }>;
  /**
   * Every kind of bill this pot still has in the window — 'dd', 'so', or
   * both — so the sentence names what is actually due from it rather than
   * assuming direct debits.
   */
  commitmentKinds: ReadonlyArray<ScheduleKind | null>;
}

export interface PaydaySummaryInput {
  /** The household's local today, 'YYYY-MM-DD'. */
  today: string;
  /** The next configured household payday — independent of receipt schedules. */
  paydayDate: string;
  /** Whole days from today to payday (the engine's `days`). */
  paydayDays: number;
  /**
   * Liquid funds now — bank and cash pots only (SPEC §7.2). Never the
   * household net total: card debt is not money available to pay bills.
   */
  availableNowPence: number;
  projectedLowPence: number | null;
  /** Projected shops and fills through payday, excluded from pot watches (SPEC §7.3/§7.5). */
  dayToDayPence: number;
  /** Pots that would run short of their own bills before payday (SPEC §7.5). */
  transfers: ReadonlyArray<PaydayTransferWatch>;
}

export interface PaydaySummary {
  /** The card's headline: "Next pay day is 26th October (18 days from today)". */
  paydayLine: string;
  /** "Based on a current household balance of …", or null with no window. */
  lowLine: string | null;
  /** The worst bills-only shortfall, with an optional day-to-day guide. */
  transfers: Array<{ potId: number; text: string }>;
  /** The day before payday — the date Horizon's look-ahead opens on. */
  horizonThroughDate: string;
}

/**
 * The kinds of bill each pot still has in the window, keyed by pot id — read
 * from the view's commitment lines so the transfer sentence can say
 * "Direct Debits", "standing orders" or both, and never guesses.
 */
export function commitmentKindsByPot(
  lines: ReadonlyArray<{ potId: number; scheduleKind: ScheduleKind | null }>,
): Map<number, ScheduleKind[]> {
  const byPot = new Map<number, ScheduleKind[]>();
  for (const line of lines) {
    if (line.scheduleKind === null) continue;
    const kinds = byPot.get(line.potId) ?? [];
    kinds.push(line.scheduleKind);
    byPot.set(line.potId, kinds);
  }
  return byPot;
}

/**
 * The summary for a read-side projection view: the one place the view's
 * shapes are turned into the builder's input, so the home card and the
 * Overview's pot watch cannot drift apart. null when there is no planning
 * cycle (no payday) to talk about.
 */
export function paydaySummaryFromView(view: ProjectionView): PaydaySummary | null {
  const { result } = view;
  if (result.paydayDate === null) return null;
  const kindsByPot = commitmentKindsByPot(view.commitmentLines);
  return buildPaydaySummary({
    today: toLocalDateString(view.snapshot.asOf),
    paydayDate: result.paydayDate,
    paydayDays: result.days,
    availableNowPence: result.availableNowPence,
    projectedLowPence: result.projectedLowPence,
    dayToDayPence: result.dayToDayPence,
    transfers: result.potWatches.map((watch) => ({
      potId: watch.potId,
      potLabel: view.potLabels.get(watch.potId) ?? `Pot ${watch.potId}`,
      shortfallPence: watch.shortfallPence,
      estimatePence: watch.estimatePence,
      earliestDueDate: watch.earliestDueDate,
      earliestCommitments: watch.earliestCommitments,
      commitmentKinds: kindsByPot.get(watch.potId) ?? [],
    })),
  });
}

export function buildPaydaySummary(input: PaydaySummaryInput): PaydaySummary {
  const { today, paydayDate, paydayDays, projectedLowPence } = input;
  const days = `${paydayDays} ${paydayDays === 1 ? 'day' : 'days'}`;

  return {
    paydayLine: `Next pay day is ${formatDayMonthLocalDate(paydayDate, today)} (${days} from today)`,
    lowLine:
      projectedLowPence === null
        ? null
        : `Based on a current household balance of ${formatPence(input.availableNowPence)} in bank ` +
          `and cash pots and no additional unplanned spending, the household low would reach ` +
          `${formatPence(projectedLowPence)}.`,
    transfers: worstTransfer(input.transfers, today, input.dayToDayPence),
    horizonThroughDate: addDaysLocal(paydayDate, -1),
  };
}

function worstTransfer(
  transfers: ReadonlyArray<PaydayTransferWatch>,
  today: string,
  dayToDayPence: number,
): Array<{ potId: number; text: string }> {
  const worst = transfers.reduce<PaydayTransferWatch | null>(
    (selected, candidate) =>
      selected === null || candidate.shortfallPence > selected.shortfallPence
        ? candidate
        : selected,
    null,
  );
  return worst === null
    ? []
    : [{ potId: worst.potId, text: transferSentence(worst, today, dayToDayPence) }];
}

function transferSentence(
  watch: PaydayTransferWatch,
  today: string,
  dayToDayPence: number,
): string {
  const amount = formatPence(watch.shortfallPence);
  const dayToDayGuide =
    dayToDayPence > 0
      ? ` If projected day-to-day spending also comes from ${watch.potLabel}, the guide shortfall ` +
        `is about ${formatPence(watch.shortfallPence + dayToDayPence)} — a guide, not a strict ` +
        `pot allocation.`
      : '';
  if (watch.earliestDueDate === null) {
    // A pot already below zero with no bills left to leave it: the shortfall
    // is the reported balance itself, and there is no due date to plan to.
    return (
      `${watch.potLabel} has the worst bills-only shortfall: ${amount}. It is already ` +
      `${formatPence(-watch.estimatePence)} overdrawn, with no bills left in this window.` +
      `${dayToDayGuide} Aim to transfer at least ${amount} into ${watch.potLabel} as soon as ` +
      `you can.`
    );
  }
  const due = formatDayMonthLocalDate(watch.earliestDueDate, today);
  const bills = listBillNames(watch.earliestCommitments.map((line) => line.name));
  const leadDate = addDaysLocal(watch.earliestDueDate, -TRANSFER_LEAD_DAYS);
  const deadline =
    leadDate <= today ? 'as soon as you can' : `by ${formatDayMonthLocalDate(leadDate, today)}`;
  return (
    `${watch.potLabel} has the worst bills-only shortfall: ${amount} (upcoming ` +
    `${commitmentNoun(watch.commitmentKinds)} next due ${due}${bills === '' ? '' : ` — ${bills}`}).` +
    `${dayToDayGuide} Aim to transfer at least ${amount} into ${watch.potLabel} ${deadline}.`
  );
}

/** Direct debits, standing orders, or both — never a guess (decision 186). */
function commitmentNoun(kinds: ReadonlyArray<ScheduleKind | null>): string {
  const directDebits = kinds.some((kind) => kind === 'dd');
  const standingOrders = kinds.some((kind) => kind === 'so');
  if (directDebits && standingOrders) return 'Direct Debits and standing orders';
  if (standingOrders) return 'standing orders';
  return 'Direct Debits';
}

/**
 * "Council tax", "Council tax and Water Bill", "A, B and C", "A, B, C and 2
 * more". Empty when there is nothing to name, which drops the bracket.
 */
function listBillNames(names: ReadonlyArray<string>): string {
  const shown = names.slice(0, MAX_LISTED_BILLS);
  const rest = names.length - shown.length;
  if (shown.length === 0) return '';
  if (rest > 0) return `${shown.join(', ')} and ${rest} more`;
  if (shown.length === 1) return shown[0] as string;
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}
