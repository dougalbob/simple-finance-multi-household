import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  GUIDE_ANCHORS,
  GUIDE_PAGE,
  GUIDE_SECTIONS,
  guideSection,
  type GuideAnchorId,
} from '../src/lib/guide';

const repoFile = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

/**
 * The guide's contract (docs/ONBOARDING_PLAN.md §5, Slice 2): the eight ideas
 * the plan names, anchored so any page can link to `/guide#checkpoint`, and
 * honest — every section must keep the rule it states. The copy lives in
 * `src/lib/guide.ts` beside the anchors, and these tests pin the anchors, the
 * shape and the load-bearing phrases, the same way tests/setup-path.test.ts
 * pins the step copy. The guide explains behaviour that is built and tested
 * elsewhere; if a phrase here ever stops being true, that is a decision, not
 * an edit.
 */
describe('the guide: eight anchored ideas, pinned to what the app really does', () => {
  it('is the eight sections the plan names, in reading order', () => {
    assert.deepEqual(
      [...GUIDE_ANCHORS],
      [
        'checkpoint',
        'income',
        'transfers',
        'borrowing',
        'schedules',
        'projection',
        'noticed',
        'never',
      ],
    );
    assert.deepEqual(
      GUIDE_SECTIONS.map((section) => section.anchor),
      [...GUIDE_ANCHORS],
      'one section per anchor, same order',
    );
  });

  it('gives every section a title, a lead, real paragraphs and a way to see it', () => {
    for (const section of GUIDE_SECTIONS) {
      assert.ok(section.title.length > 5, `${section.anchor} has no title`);
      assert.ok(section.lead.length > 20, `${section.anchor} has no lead`);
      assert.ok(section.paragraphs.length >= 2, `${section.anchor} is too thin`);
      for (const paragraph of section.paragraphs) {
        assert.ok(paragraph.length > 60, `${section.anchor} has a stub paragraph`);
      }
      assert.ok(section.seeAlso.length > 0, `${section.anchor} never says where to see it`);
      for (const link of section.seeAlso) {
        assert.ok(link.href.startsWith('/'), `${section.anchor} links outside the app`);
        assert.ok(link.label.length > 0, `${section.anchor} has an unnamed link`);
      }
    }
  });

  it('resolves sections by anchor, and refuses an invented one', () => {
    for (const anchor of GUIDE_ANCHORS) {
      assert.equal(guideSection(anchor).anchor, anchor);
    }
    assert.throws(() => guideSection('wizard' as GuideAnchorId), /unknown guide anchor/);
  });

  it('keeps the load-bearing promises word-for-word', () => {
    const text = (anchor: GuideAnchorId) => {
      const section = guideSection(anchor);
      return [section.title, section.lead, ...section.paragraphs].join('\n');
    };
    // Checkpoint vs estimate vs bank balance — the app's central honesty rule.
    assert.match(text('checkpoint'), /never a bank balance/);
    assert.match(text('checkpoint'), /immutable history/);
    assert.match(text('checkpoint'), /does not guess/);
    // Income is not spending (BAC), and expected income is never received.
    assert.match(text('income'), /BAC/);
    assert.match(text('income'), /never treated as received/);
    // Transfers are not spending — including paying your own card back.
    assert.match(text('transfers'), /two-sided/);
    assert.match(text('transfers'), /Paying your own card back is a transfer, not a payment/);
    // Decision 225 (issue #55): a transfer is corrected or voided where it is
    // read — beneath its own row in All Transactions — not on the pots page.
    assert.match(text('transfers'), /opens right where you read it in All Transactions/);
    assert.ok(
      guideSection('transfers').seeAlso.some((link) => link.href === '/transactions'),
      'the transfers section points at All Transactions',
    );
    assert.equal(
      guideSection('transfers').seeAlso.some((link) => link.href === '/pots'),
      false,
      'the pots page no longer lists transfers',
    );
    // Borrowing is owed, never income; informal IOUs only; awaiting, never
    // falsely nothing owing (decision 168, re-worded by issue #68).
    assert.match(text('borrowing'), /expected — never received/);
    assert.match(text('borrowing'), /informal IOUs/);
    assert.match(text('borrowing'), /awaiting its first payment, never “nothing owing”/);
    // Schedules convert on the due date; edits apply from the next instance;
    // the one backfill exception (decision 162); the category of a
    // converted payment is forward-only (tests/schedule-category-correction.test.ts).
    assert.match(text('schedules'), /history is never rewritten/);
    assert.match(text('schedules'), /from the next instance onward/);
    assert.match(text('schedules'), /backfills the due dates it missed/);
    assert.match(text('schedules'), /keeps the category it converted with/);
    // The projection is arithmetic on configured figures; the honesty loop is
    // the feedback; weekends shift to Friday; cards stay out of the liquid
    // projection (decision 171).
    assert.match(text('projection'), /arithmetic on your figures/);
    assert.match(text('projection'), /honesty loop/);
    assert.match(text('projection'), /Friday before/);
    assert.match(text('projection'), /stay out of the liquid projection/);
    // “The app has noticed” is derived prompts, never notifications.
    assert.match(text('noticed'), /never notifications/);
    assert.match(text('noticed'), /no emails, no alerts/);
    // What the app will never do — the non-goals, in plain language.
    assert.match(text('never'), /no bank credentials/);
    assert.match(text('never'), /never gives financial advice/);
    assert.match(text('never'), /never sends notifications/);
    assert.match(text('never'), /read-only and audited/);
    assert.match(text('never'), /derived from your records/);
  });

  it('names itself the way the household chose, and the page renders the sections', () => {
    assert.equal(GUIDE_PAGE.eyebrow, 'Guide');
    assert.equal(GUIDE_PAGE.title, 'How this app thinks');
    // The page maps the data — it carries no prose of its own that could
    // drift from the anchors other surfaces link to.
    const page = repoFile('src/app/guide/page.tsx');
    assert.ok(page.includes('GUIDE_SECTIONS'), 'the guide page must render GUIDE_SECTIONS');
    assert.ok(page.includes('id={section.anchor}'), 'every section must carry its anchor id');
    assert.ok(page.includes('sf-anchor'), 'anchor jumps must clear the sticky header');
  });
});
