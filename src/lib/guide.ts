/**
 * The vocabulary page (docs/ONBOARDING_PLAN.md §5, Slice 2): eight ideas that
 * make the rest of the app click — checkpoint vs estimate vs bank balance,
 * income is not spending, transfers are not spending, borrowing is owed and
 * never income, schedules convert and history is never rewritten, the
 * projection is arithmetic on configured figures, what “the app has noticed”
 * is, and what the app will never do.
 *
 * The copy lives here, beside the anchor ids, for the same reason the setup
 * path keeps its copy in `setup-path.ts`: the “what this page needs first”
 * blocks (`page-needs.ts`) link to these anchors from four other surfaces,
 * and the unit tests pin the anchors and the key phrases, so the page cannot
 * drift into a promise the app does not keep. Every sentence here describes
 * behaviour that is already built and tested — the guide explains the app, it
 * never extends it.
 */

/** The eight anchors, in reading order. Any page may link to `/guide#<anchor>`. */
export const GUIDE_ANCHORS = [
  'checkpoint',
  'income',
  'transfers',
  'borrowing',
  'schedules',
  'projection',
  'noticed',
  'never',
] as const;

export type GuideAnchorId = (typeof GUIDE_ANCHORS)[number];

export interface GuideLink {
  readonly href: string;
  readonly label: string;
}

export interface GuideSection {
  readonly anchor: GuideAnchorId;
  /** The short title — also the link text when another page cites the section. */
  readonly title: string;
  /** One sentence that carries the whole idea. */
  readonly lead: string;
  readonly paragraphs: readonly string[];
  /** Where the idea is visible in the app. */
  readonly seeAlso: readonly GuideLink[];
}

export const GUIDE_PAGE = {
  eyebrow: 'Guide',
  title: 'How this app thinks',
  intro:
    'Eight short ideas that make the rest of the app click. None of this is a setting and none of it is a tutorial — it is how the app already behaves, said out loud, so the figures on every page can be trusted. Any page can link into a section: /guide#checkpoint lands straight on the first one.',
  tocTitle: 'The eight ideas',
} as const;

export const GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    anchor: 'checkpoint',
    title: 'Checkpoints, estimates and bank balances',
    lead: 'Three different numbers — and the app only ever claims one of them.',
    paragraphs: [
      'A checkpoint is you telling the app what a pot holds right now: the figure read from your bank, or cash counted by hand. Checkpoints are the only anchor to reality the app has, and they are immutable history — a new one never edits an old one.',
      'An estimate is the app’s arithmetic on top of your last checkpoint: that figure plus everything recorded since. Every balance in the app is an estimate — your reported figures plus recorded activity, never a bank balance. A pot with no checkpoint shows no estimate at all, because the app does not guess.',
      'The bank’s own number is the third figure, and the app never claims it: there is no bank connection of any kind. Records dated before a checkpoint are assumed to be inside the counted figure, so a credit you record after counting the same day’s money is added on top. If an estimate and the bank disagree, the honest fix is a new checkpoint — and when they disagree often, Insights shows which configured figure is drifting.',
    ],
    seeAlso: [
      { href: '/pots', label: 'Accounts, Pots & Checkpoints' },
      { href: '/#quick-entry', label: 'the till’s Balance tab' },
    ],
  },
  {
    anchor: 'income',
    title: 'Income is not spending',
    lead: 'Money in and money out are different records, and no figure in the app mixes them.',
    paragraphs: [
      'Income — a salary converted from its schedule, or a one-off like a gift, a refund or a sale — appears in All Transactions as a BAC row, the app’s code for a receipt. It carries no category and no target, and it never joins a spending figure: not the month comparison, not the charts, not the groceries average.',
      'Expected income is never treated as received. The projection counts a salary as money due, and until its schedule converts it into a real record on the due date, every forecast line stays an expectation — the app’s figures say what should arrive, and only your records say what did.',
    ],
    seeAlso: [
      { href: '/income', label: 'Income' },
      { href: '/transactions', label: 'All Transactions' },
    ],
  },
  {
    anchor: 'transfers',
    title: 'Transfers are not spending',
    lead: 'Moving money between your own pots changes where it sits, not how much you have.',
    paragraphs: [
      'A transfer — current account to bills account, bank to a cash pot, bank to your own credit card — is internal and two-sided. It moves the pots’ estimates, and no insight, chart or month comparison ever counts it as spending. Paying your own card back is a transfer, not a payment.',
      'That is why the till keeps a Move tab of its own, and why a transfer opens right where you read it in All Transactions: select its pot name and a mistaken transfer is corrected beneath its own row — its pots, its amount, its date or a note added afterwards — or voided, and never re-categorised as spending.',
    ],
    seeAlso: [
      { href: '/#quick-entry', label: 'the till’s Move tab' },
      { href: '/transactions', label: 'correct and void transfers in All Transactions' },
    ],
  },
  {
    anchor: 'borrowing',
    title: 'Borrowed money is owed, never income',
    lead: 'Money that crosses the household boundary is tracked as what it is: owed.',
    paragraphs: [
      'A loan from family, an expected-support plan, a swap with someone outside the household — these move your estimates honestly, but they are never income and never spending. In the projection they appear flagged “expected — never received”, and they land only if the money is actually borrowed and recorded.',
      'Debts are informal IOUs: who, which way round, and what is still owed. There is no interest, no repayment schedule and no credit agreement anywhere in the app — a repayment is recorded when it happens, and the balance derives from the movements. A loan with no movements yet is awaiting its first payment, never “settled”.',
    ],
    seeAlso: [
      { href: '/pots', label: 'Owed and Owing on the pots page' },
      { href: '/horizon', label: 'Horizon' },
    ],
  },
  {
    anchor: 'schedules',
    title: 'Schedules convert on the due date — history is never rewritten',
    lead: 'Direct debits, standing orders and the salary are schedules; the records they become are permanent.',
    paragraphs: [
      'A schedule materialises its due dates, and on each due date the payment converts into a real record — a DD or SO purchase, or a BAC receipt — tagged with the schedule that produced it. That converted history is never rewritten: edit a schedule and the change applies from the next instance onward.',
      'The one exception is deliberate: moving a schedule’s start date earlier backfills the due dates it missed, because those are dates the household believes in. And a converted payment keeps the category it converted with, even if the schedule’s category changes later — correcting history is an audited edit on the purchase itself, on the Purchases page.',
    ],
    seeAlso: [
      { href: '/recurring', label: 'Recurring' },
      { href: '/transactions', label: 'All Transactions' },
    ],
  },
  {
    anchor: 'projection',
    title: 'The projection is arithmetic on your figures, not a forecast of your behaviour',
    lead: 'The payday card, Horizon and the forecast chart are one engine, and it models nothing.',
    paragraphs: [
      'Available now, plus expected money in, minus known commitments, minus your configured day-to-day figures — a weekly shop figure and a monthly fuel figure per vehicle. That is the whole calculation. It cannot learn your habits and it cannot surprise you: if a figure is wrong, the projection is wrong by exactly that much.',
      'Which is why Insights runs the honesty loop: it compares your configured figures with what your recorded purchases actually came to — complete weeks and months only, so an in-progress period never skews the average — and reports the drift to the penny. Correcting a figure is correcting the projection.',
      'A due day that falls on a weekend is expected on the Friday before, and credit-card balances stay out of the liquid projection entirely: they count in the household total, but they are not cash available to pay bills.',
    ],
    seeAlso: [
      { href: '/', label: 'the payday card on the home page' },
      { href: '/horizon', label: 'Horizon' },
      { href: '/charts', label: 'the forecast chart' },
      { href: '/insights', label: 'the honesty loop' },
    ],
  },
  {
    anchor: 'noticed',
    title: 'What “the app has noticed” means',
    lead: 'The bell and Tasks list prompts derived from your own records — never notifications.',
    paragraphs: [
      'A renewal approaching, a contract ending, a card statement review, a follow-up you promised a supplier, a task you left open: every bell item exists because a record says so, and it links straight to that record. Nothing is pushed anywhere — no emails, no alerts — the app waits for you to look.',
      'Tasks are the follow-ups themselves: they stay open until they are completed, and a logged supplier call can leave one behind so a promise is not lost. The panel’s “since you last looked” line is one small piece of UI state — when you last opened the bell — not a financial record.',
    ],
    seeAlso: [
      { href: '/tasks', label: 'Tasks' },
      { href: '/contracts', label: 'Contracts & Renewals' },
    ],
  },
  {
    anchor: 'never',
    title: 'What the app will never do',
    lead: 'The boundaries are part of the design, not missing features.',
    paragraphs: [
      'It never connects to a bank: no statement import, no open banking, no bank credentials — the checkpoint is you, on purpose. It never gives financial advice: it reports your records and your figures, and its verdicts are arithmetic. It never sends notifications, reminders or emails.',
      'It never quietly rewrites history — voids, edits and refunds stay visible and audited. It never shows one household another household’s data: support access is explicit, time-limited, read-only and audited. And it never keeps onboarding state — every “done” in Getting started is derived from your records, so it cannot disagree with them.',
    ],
    seeAlso: [
      { href: '/start', label: 'Getting started' },
      { href: '/settings', label: 'Settings' },
    ],
  },
];

/** Look up one section by anchor — the needs blocks cite sections by id only. */
export function guideSection(anchor: GuideAnchorId): GuideSection {
  const found = GUIDE_SECTIONS.find((section) => section.anchor === anchor);
  if (found === undefined) throw new Error(`unknown guide anchor: ${anchor}`);
  return found;
}
