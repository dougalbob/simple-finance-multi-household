import Link from 'next/link';
import { guideSection } from '@/lib/guide';
import { NEEDS_FIRST_TITLE, type PageNeed } from '@/lib/records/page-needs';

/**
 * “What this page needs first” (docs/ONBOARDING_PLAN.md §5, Slice 2): the
 * small pattern that replaces the zero-figure scaffolding on the payoff
 * pages. One sentence per missing record, a link to the setup step that
 * supplies it, and — where an idea bites — the guide section that explains
 * it. It renders nothing when the needs list is empty, so a complete
 * household never sees it and nothing nags in duplicate.
 *
 * Server-rendered like the rest of the app: no client JavaScript, no state,
 * nothing dismissed — the list is the derivation in `page-needs.ts`.
 */
export function NeedsFirst({
  needs,
  variant = 'section',
  className = '',
  headingId = 'needs-first-heading',
}: {
  needs: readonly PageNeed[];
  /**
   * `section` brings its own dashed card and heading; `inline` is the bare
   * list, for a card the page already drew (the home projection card, the
   * Horizon checkpoint block, the forecast chart card).
   */
  variant?: 'section' | 'inline';
  className?: string;
  headingId?: string;
}) {
  if (needs.length === 0) return null;

  const list = (
    <ul className={variant === 'section' ? 'mt-3 space-y-3' : 'mt-2 space-y-3'}>
      {needs.map((need) => (
        <li key={need.id} className="text-sm">
          <p className="text-ink-soft">
            {need.sentence}{' '}
            <Link href={need.actionHref} className="font-medium text-accent hover:underline">
              {need.actionLabel} →
            </Link>
          </p>
          {need.guideAnchor !== null ? (
            <p className="mt-0.5 text-xs">
              <Link
                href={`/guide#${need.guideAnchor}`}
                className="text-ink-muted hover:text-ink hover:underline"
              >
                How this app thinks: {guideSection(need.guideAnchor).title} →
              </Link>
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );

  if (variant === 'inline') {
    return <div className={className}>{list}</div>;
  }

  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-xl border border-dashed border-border-strong bg-surface p-4 ${className}`}
    >
      <h2 id={headingId} className="text-lg font-semibold">
        {NEEDS_FIRST_TITLE}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Nothing is blocked and no page is hidden — the till works now. These are the records this
        view reads, and the steps that supply them.
      </p>
      {list}
      <p className="mt-3 text-sm">
        <Link href="/start" className="font-medium text-accent hover:underline">
          See the whole setup path →
        </Link>
      </p>
    </section>
  );
}
