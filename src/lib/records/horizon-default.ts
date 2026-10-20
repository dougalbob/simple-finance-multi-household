import { addDaysLocal } from './dates';
import { isValidLocalDate } from '../time';

/**
 * Horizon's "Look ahead to" date (SPEC §7.6, decision 150) — pure, so the
 * rules are pinned in Node rather than only through the browser.
 *
 * - An explicit `?through=` that is a valid local date inside
 *   `[minDate, maxDate]` is used exactly as given (a shared or bookmarked
 *   horizon opens on the date it names).
 * - When a household payday is configured, default to **the day before the
 *   next payday**, clamped into `[minDate, maxDate]` so the browser never
 *   blocks a submission from a field the page filled in itself.
 * - Only when no payday is configured, use `today + fallbackDays` (five
 *   weeks), clamped the same way. Receipt schedules never define this window.
 *
 * All arithmetic is local-calendar (`addDaysLocal`), never `Date` maths.
 */
export interface HorizonThroughInput {
  /** The household's local today, `YYYY-MM-DD`. */
  today: string;
  /** The raw `?through=` value, if any (never trusted). */
  requested?: string | null;
  /** The next configured household payday, or null when no payday is set. */
  nextPaydayDate: string | null;
  /** Earliest selectable date (today + 1). */
  minDate: string;
  /** Latest selectable date (today + 400). */
  maxDate: string;
  /** Fallback window when no payday is configured (35 days). */
  fallbackDays: number;
}

export type HorizonThroughSource = 'requested' | 'day-before-payday' | 'fallback';

export interface HorizonThrough {
  date: string;
  source: HorizonThroughSource;
}

function clamp(date: string, minDate: string, maxDate: string): string {
  if (date < minDate) return minDate;
  if (date > maxDate) return maxDate;
  return date;
}

/** The default alone (no `?through=`): day before the configured payday, else the fallback. */
export function defaultHorizonThrough(
  input: Omit<HorizonThroughInput, 'requested'>,
): HorizonThrough {
  const { today, nextPaydayDate, minDate, maxDate, fallbackDays } = input;
  if (nextPaydayDate !== null && isValidLocalDate(nextPaydayDate) && nextPaydayDate > today) {
    return {
      date: clamp(addDaysLocal(nextPaydayDate, -1), minDate, maxDate),
      source: 'day-before-payday',
    };
  }
  return { date: clamp(addDaysLocal(today, fallbackDays), minDate, maxDate), source: 'fallback' };
}

/** The date the page uses: a valid in-range `?through=`, else the default. */
export function resolveHorizonThrough(input: HorizonThroughInput): HorizonThrough {
  const requested = typeof input.requested === 'string' ? input.requested : '';
  if (isValidLocalDate(requested) && requested >= input.minDate && requested <= input.maxDate) {
    return { date: requested, source: 'requested' };
  }
  return defaultHorizonThrough(input);
}
