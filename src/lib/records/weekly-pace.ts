import { formatPence } from '../money';
import { formatShortLocalDate } from '../time';
import { daysBetween } from './dates';

/** Zero, never the overdraft, is the spending boundary. Whole pounds, floored. */
export function weeklyPacePence(
  today: string,
  lowDate: string | null,
  low: number | null,
): number | null {
  if (low === null || low <= 0 || lowDate === null) return null;
  const days = daysBetween(today, lowDate);
  return days <= 0 ? null : Math.floor((low * 7) / (days * 100)) * 100;
}

export function weeklyPaceText(today: string, lowDate: string | null, low: number | null): string {
  if (low === null) return '';
  if (low < 0) return `Projected shortfall: ${formatPence(-low)} below zero. No weekly allowance.`;
  if (low === 0) return 'The forecast already touches zero. No weekly allowance.';
  const pace = weeklyPacePence(today, lowDate, low);
  if (pace === null)
    return 'The lowest point is already today — no weekly allowance can be calculated.';
  return `About ${formatPence(pace)} a week spare until ${formatShortLocalDate(lowDate!)}, on top of the planned shop and fuel — rounded down. Spending it all would touch zero at the lowest point.`;
}
