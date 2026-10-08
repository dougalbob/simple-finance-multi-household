import { formatPence } from '../money';
import { formatDayMonthLocalDate, toLocalDateString } from '../time';
import { addDaysLocal } from './dates';
import type { ProjectionView } from './money-view';
import type { WarningTier } from './projection';
import type { ScheduleKind } from './schedules';

/**
 * The payday summary (v0.36.0, decision 186): the short, plain-English card
 * the household asked for on the phone home, and the same sentences for the
 * pot watch wherever it is shown. Everything the old projection panel
 * expanded into — the day-by-day table, the projected shops and fills, the
 * expected support list, the weekly pace — lives on Horizon, so the home
 * card states the four facts and links there:
 *
 *     Next pay day is 26th October (18 days from today)
 *     Based on a current household balance of £242.22 in bank and cash pots
 *     and no additional unplanned spending, the household low would reach
 *     -£165.25. No overdraft fees would be incurred.
 *     Plan a transfer? Natwest will run about £850.00 short of its upcoming
 *     Direct Debits (next due 21st October — Council tax, Mortgage and Water
 *     Bill). Aim to transfer at least £850.00 into Natwest by 16th October.
 *
 * Pure and framework-free: the wording is pinned in Node, so a number that
 * moves is a failed test rather than a sentence nobody re-read.
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
  /** The next scheduled income date — the planning cycle's payday. */
  paydayDate: string;
  /** Whole days from today to payday (the engine's `days`). */
  paydayDays: number;
  /**
   * Liquid funds now — bank and cash pots only (SPEC §7.2). Never the
   * household net total: card debt is not money available to pay bills.
   */
  availableNowPence: number;
  projectedLowPence: number | null;
  tier: WarningTier;
  /** The configured bank warning threshold, when there is one (SPEC §8). */
  warningThresholdPence: number | null;
  /** Pots that would run short of their own bills before payday (SPEC §7.5). */
  transfers: ReadonlyArray<PaydayTransferWatch>;
}

export interface PaydaySummary {
  /** The card's headline: "Next pay day is 26th October (18 days from today)". */
  paydayLine: string;
  /** "Based on a current household balance of …", or null with no window. */
  lowLine: string | null;
  /** The fee sentence for the tier — "No overdraft fees would be incurred." */
  overdraftLine: string | null;
  /** One sentence per pot that would run short; empty when every pot covers its bills. */
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
    tier: result.tier,
    warningThresholdPence: result.warningThresholdPence,
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
    overdraftLine:
      projectedLowPence === null
        ? null
        : overdraftSentence(input.tier, input.warningThresholdPence),
    transfers: input.transfers.map((watch) => ({
      potId: watch.potId,
      text: transferSentence(watch, today),
    })),
    horizonThroughDate: addDaysLocal(paydayDate, -1),
  };
}

/**
 * The fee sentence follows the tier (SPEC §8). Below zero but inside the
 * household's own threshold is exactly the state the household asked to be
 * reassured about — the low is covered, so no fee. Past the threshold the app
 * says so plainly instead of promising fees it cannot know about.
 */
function overdraftSentence(tier: WarningTier, warningThresholdPence: number | null): string {
  if (tier !== 'warning') return 'No overdraft fees would be incurred.';
  return warningThresholdPence === null
    ? 'Overdraft fees are likely.'
    : `Overdraft fees are likely — the low passes the configured ${formatPence(warningThresholdPence)} bank warning threshold.`;
}

function transferSentence(watch: PaydayTransferWatch, today: string): string {
  const amount = formatPence(watch.shortfallPence);
  if (watch.earliestDueDate === null) {
    // A pot already below zero with nothing left to leave it: the shortfall
    // is the reported balance itself, and there is no due date to plan to.
    return (
      `${watch.potLabel} is already ${formatPence(-watch.estimatePence)} overdrawn and has no ` +
      `bills left in this window. Aim to transfer at least ${amount} into ${watch.potLabel} as ` +
      `soon as you can.`
    );
  }
  const due = formatDayMonthLocalDate(watch.earliestDueDate, today);
  const bills = listBillNames(watch.earliestCommitments.map((line) => line.name));
  const leadDate = addDaysLocal(watch.earliestDueDate, -TRANSFER_LEAD_DAYS);
  const deadline =
    leadDate <= today ? 'as soon as you can' : `by ${formatDayMonthLocalDate(leadDate, today)}`;
  return (
    `${watch.potLabel} will run about ${amount} short of its upcoming ` +
    `${commitmentNoun(watch.commitmentKinds)} (next due ${due}${bills === '' ? '' : ` — ${bills}`})` +
    `. Aim to transfer at least ${amount} into ${watch.potLabel} ${deadline}.`
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
