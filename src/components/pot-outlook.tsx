import Link from 'next/link';
import { formatPence } from '@/lib/money';
import type { CycleOutlook, CycleOutlookPot } from '@/lib/records/money-view';
import {
  formatOrdinalDayMonthShortLocalDate,
  formatShortLocalDate,
  toLocalDateString,
} from '@/lib/time';

/** Shared configured-payday low and weekly pace (SPEC §7.7, decision 166). */
export function CycleOutlookLine({
  outlook,
  className,
}: {
  outlook: CycleOutlook;
  className?: string;
}) {
  if (outlook.paydayDate === null) {
    return (
      <p className="rounded-lg bg-canvas px-3 py-2 text-sm text-ink-soft">
        No household payday is set yet, so there is no “lowest before payday” figure. Set one in{' '}
        <Link href="/settings#payday-setting" className="sf-link">
          Settings
        </Link>
        .
      </p>
    );
  }
  if (outlook.freeToSpendPence === null) {
    return (
      <p className="rounded-lg bg-canvas px-3 py-2 text-sm text-ink-soft">
        Record a balance checkpoint and the “lowest before pay day” figure appears here.
      </p>
    );
  }
  const negative = outlook.freeToSpendPence < 0;
  const paydayLabel = formatOrdinalDayMonthShortLocalDate(
    outlook.paydayDate,
    toLocalDateString(outlook.asOf),
  );
  return (
    <p
      className={`rounded-lg px-3 py-2 text-sm ${
        negative
          ? 'bg-negative-50 font-medium text-negative-900 ring-1 ring-negative-200'
          : 'bg-canvas text-ink-body'
      } ${className ?? ''}`}
    >
      Lowest before {paydayLabel} pay day:{' '}
      <span className="font-semibold tabular-nums">{formatPence(outlook.freeToSpendPence)}</span>.{' '}
      {outlook.paceText}
      {negative
        ? null
        : ` Receipts due on payday do not raise this before-payday low; other receipts are counted on their due dates.`}
    </p>
  );
}

/**
 * The per-pot version for the pot cards: the pot's estimate minus the bills
 * due from that pot before payday (§7.5's watch, in the same window).
 * A shortfall is loud; a healthy figure is quiet context.
 */
export function PotOutlookLine({
  pot,
  paydayDate,
}: {
  pot: CycleOutlookPot | undefined;
  paydayDate: string | null;
}) {
  // No configured payday, no window — nothing honest to say here.
  if (paydayDate === null || pot === undefined || pot.spendablePence === null) return null;
  const window = formatShortLocalDate(paydayDate);
  if (pot.shortfallPence !== null) {
    const first = pot.outgoing[0];
    return (
      <p className="mt-2 rounded-md bg-warning-100 px-2 py-1 text-xs font-semibold text-warning-900">
        {formatPence(pot.shortfallPence)} short of its own bills
        {window === null ? '' : ` before ${window}`}
        {first === undefined
          ? ''
          : ` — ${first.name} ${formatPence(first.amountPence)} on ${formatShortLocalDate(first.dueDate)}`}
      </p>
    );
  }
  return (
    <p className="mt-2 text-xs text-ink-soft">
      Before payday{window === null ? '' : ` (${window})`}:{' '}
      <span className="font-semibold tabular-nums">{formatPence(pot.spendablePence)}</span>
    </p>
  );
}
