import { formatPence } from '../money';
import { daysBetween } from './dates';

/**
 * The key-date alert engine (docs/SPEC.md §22): legacy reminders, tracked
 * agreement renewal/switch dates, unlinked schedule end dates and card dates
 * share one Overview panel while retaining their distinct meanings.
 *
 * Pure date arithmetic: per-item warning windows, an available-now state for
 * past fee-free switch dates, "rolled / awaiting review" for old schedule ends
 * (instances never auto-stop), and review prompts for overdue policy dates.
 * Annual date advancement happens before this engine runs; tracked insurance
 * advances only when provider auto-renew is explicitly yes.
 */

export type KeyDateKind =
  | 'renewal'
  | 'contract-end'
  | 'agreement-renewal'
  | 'switch-date'
  | 'credit-card-payment'
  | 'credit-card-promo-end';

export interface KeyDateItem {
  id: number;
  kind: KeyDateKind;
  label: string;
  /** Local date ('YYYY-MM-DD') of the event being reviewed. */
  date: string;
  /** Per-item warning lead in days (default 21, SPEC §22.2 / decision 23). */
  leadDays: number;
  supplierId?: number | null;
  targetLabel?: string | null;
  scheduleId?: number | null;
  agreementId?: number | null;
  autoRenew?: 'yes' | 'no' | 'unknown' | null;
  potId?: number | null;
  /** Copied from the current card statement; never calculated by this app. */
  minimumPaymentPence?: number | null;
}

export type KeyDateState = 'today' | 'in-window' | 'available' | 'rolled-awaiting-review' | 'past';

export interface KeyDateAlert extends KeyDateItem {
  daysUntil: number;
  state: KeyDateState;
}

const STATE_RANK: Record<KeyDateState, number> = {
  today: 0,
  'in-window': 1,
  available: 2,
  'rolled-awaiting-review': 3,
  past: 4,
};

/**
 * The alert list: everything inside its warning window (soonest first),
 * today's items first, then the honest past states. Items outside their
 * window are omitted — the panel is quiet until a date matters.
 */
export function computeKeyDateAlerts(items: readonly KeyDateItem[], today: string): KeyDateAlert[] {
  const alerts: KeyDateAlert[] = [];
  for (const item of items) {
    const daysUntil = daysBetween(today, item.date);
    let state: KeyDateState | null = null;
    if (daysUntil === 0) {
      state = 'today';
    } else if (daysUntil > 0 && daysUntil <= item.leadDays) {
      state = 'in-window';
    } else if (daysUntil < 0) {
      // Old schedule end dates mean the payment schedule rolled on. A modern
      // fee-free switch date remains useful after it arrives: the household is
      // now eligible to switch without the early-exit fee.
      state =
        item.kind === 'contract-end'
          ? 'rolled-awaiting-review'
          : item.kind === 'switch-date'
            ? 'available'
            : 'past';
    }
    if (state !== null) {
      alerts.push({ ...item, daysUntil, state });
    }
  }
  alerts.sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || a.date.localeCompare(b.date));
  return alerts;
}

/**
 * The one-line message for a key-date alert (SPEC §22.3 / E9). Colour is
 * never the only signal — the text carries the state.
 */
export function keyDateMessage(alert: KeyDateAlert): string {
  const inDays = `${alert.daysUntil} ${alert.daysUntil === 1 ? 'day' : 'days'}`;
  if (alert.kind === 'agreement-renewal') {
    if (alert.state === 'today') return agreementRenewalMessage(alert, 'today');
    if (alert.state === 'in-window') return agreementRenewalMessage(alert, `in ${inDays}`);
    if (alert.state === 'past') return agreementRenewalPastMessage(alert);
  }
  if (alert.kind === 'switch-date') {
    if (alert.state === 'today') {
      return `You can switch ${alert.label} without an exit fee from today`;
    }
    if (alert.state === 'in-window') {
      return `${alert.label} can be switched without an exit fee in ${inDays} — time to shop around`;
    }
    if (alert.state === 'available') {
      return `A fee-free switch for ${alert.label} has been available since ${alert.date}`;
    }
  }

  switch (alert.state) {
    case 'today':
      if (alert.kind === 'credit-card-payment') {
        return `Review ${alert.label} payment today${minimumPaymentText(alert)}`;
      }
      if (alert.kind === 'credit-card-promo-end') {
        return `0% offer on ${alert.label} ends today — check the card terms and remaining balance`;
      }
      return alert.kind === 'renewal' ? `${alert.label} renews today` : `${alert.label} ends today`;
    case 'in-window':
      if (alert.kind === 'credit-card-payment') {
        return `${alert.label} payment due in ${inDays}${minimumPaymentText(alert)} — check the statement and choose an amount`;
      }
      if (alert.kind === 'credit-card-promo-end') {
        return `0% offer on ${alert.label} ends in ${inDays} — review the remaining balance`;
      }
      return alert.kind === 'renewal'
        ? `${alert.label} renews in ${inDays}`
        : `${alert.label} ends in ${inDays} — time to shop around`;
    case 'rolled-awaiting-review':
      return `${alert.label} ended on ${alert.date} — rolled / awaiting review`;
    case 'available':
      return `A fee-free switch for ${alert.label} has been available since ${alert.date}`;
    case 'past':
      if (alert.kind === 'credit-card-payment') {
        return `${alert.label} payment due date passed — check the provider; the app cannot verify payment`;
      }
      if (alert.kind === 'credit-card-promo-end') {
        return `0% offer on ${alert.label} ended on ${alert.date} — check the current card terms and balance`;
      }
      return `${alert.label} was due on ${alert.date} — review it`;
  }
}

function agreementRenewalMessage(alert: KeyDateAlert, when: string): string {
  if (alert.autoRenew === 'yes') return `${alert.label} renews ${when}`;
  if (alert.autoRenew === 'no') {
    return alert.state === 'today'
      ? `${alert.label} cover ends today — arrange cover or switch`
      : `${alert.label} cover ends ${when} — arrange cover or switch`;
  }
  return `${alert.label} renewal date is ${when} — check the policy`;
}

function agreementRenewalPastMessage(alert: KeyDateAlert): string {
  if (alert.autoRenew === 'no') {
    return `${alert.label} cover may have ended on ${alert.date} — confirm it is renewed`;
  }
  return `${alert.label} renewal date passed on ${alert.date} — review it`;
}

function minimumPaymentText(alert: KeyDateAlert): string {
  return alert.minimumPaymentPence === null || alert.minimumPaymentPence === undefined
    ? ''
    : ` — statement minimum ${formatPence(alert.minimumPaymentPence)}`;
}

/**
 * Where a key date is dealt with — the deep link the Tasks page ("The app has
 * noticed", SPEC §25.4) puts on each alert: legacy renewal anchors and tracked
 * agreements on Contracts & Renewals, unlinked legacy schedule dates on
 * Recurring, and card dates on Pots.
 */
export function keyDateHref(
  alert: Pick<KeyDateItem, 'kind' | 'id' | 'scheduleId' | 'agreementId' | 'potId'>,
): string {
  switch (alert.kind) {
    case 'renewal':
      return `/contracts#renewal-${alert.id}`;
    case 'contract-end':
      return `/recurring#schedule-edit-${alert.scheduleId ?? alert.id}`;
    case 'agreement-renewal':
    case 'switch-date':
      return `/contracts#agreement-${alert.agreementId ?? alert.id}`;
    case 'credit-card-payment':
    case 'credit-card-promo-end':
      return `/pots#pot-${alert.potId ?? alert.id}-heading`;
  }
}

/** The alert's state as a short word or two, printed beside the sentence. */
export function keyDateStateWords(alert: Pick<KeyDateAlert, 'state' | 'daysUntil'>): string {
  switch (alert.state) {
    case 'today':
      return 'Today';
    case 'in-window':
      return alert.daysUntil === 1 ? 'Tomorrow' : `In ${alert.daysUntil} days`;
    case 'available':
      return 'Available now';
    case 'rolled-awaiting-review':
      return 'Awaiting review';
    case 'past':
      return 'Date passed';
  }
}
