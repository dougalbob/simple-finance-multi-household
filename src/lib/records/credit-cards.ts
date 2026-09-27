import { clampedDueDate } from './dates';
import type { Pot } from './pots';

/**
 * The date used by the card-payment reminder. An entered statement date wins
 * (it reflects the provider's current statement); otherwise the usual
 * monthly due day is clamped into the current or next calendar month.
 */
export function creditCardPaymentReminderDate(
  pot: Pick<Pot, 'creditCardPaymentDayOfMonth' | 'creditCardStatementDueDate'>,
  today: string,
): string | null {
  if (pot.creditCardStatementDueDate !== null) return pot.creditCardStatementDueDate;
  const dueDay = pot.creditCardPaymentDayOfMonth;
  if (dueDay === null) return null;

  const [year, month] = today.split('-').map(Number) as [number, number];
  const thisMonth = clampedDueDate(dueDay, year, month);
  if (thisMonth >= today) return thisMonth;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return clampedDueDate(dueDay, nextYear, nextMonth);
}
