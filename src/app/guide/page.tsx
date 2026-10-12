import Link from 'next/link';
import { redirect } from 'next/navigation';
import { householdContextFromRequest } from '@/lib/auth/next';
import { GUIDE_PAGE, GUIDE_SECTIONS } from '@/lib/guide';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Guide' };

/**
 * The guide (docs/ONBOARDING_PLAN.md §5, Slice 2): one page, plain language,
 * the ideas that make the rest click. It is anchored — `/guide#checkpoint` —
 * so any page can link straight into a section, and the “what this page needs
 * first” blocks do exactly that.
 *
 * The page renders `GUIDE_SECTIONS` from `src/lib/guide.ts`; the copy lives
 * there beside the anchors so the links other surfaces carry can never drift
 * from the sections that exist. It explains behaviour that is already built
 * and tested — it adds none of its own, stores nothing, and like every page
 * it stays behind the sign-in gate. It is deliberately not a navigation
 * entry: the footer and the pages that need a concept carry the links.
 */
export default async function GuidePage() {
  const user = await householdContextFromRequest();
  if (user === null) redirect('/unauthorized');

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          {GUIDE_PAGE.eyebrow}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{GUIDE_PAGE.title}</h1>
        <p className="mt-2 text-sm text-ink-soft">{GUIDE_PAGE.intro}</p>
      </header>

      <nav
        aria-label={GUIDE_PAGE.tocTitle}
        className="mb-6 rounded-xl border border-border bg-surface p-4 shadow-sm"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {GUIDE_PAGE.tocTitle}
        </h2>
        <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {GUIDE_SECTIONS.map((section, index) => (
            <li key={section.anchor}>
              <Link href={`#${section.anchor}`} className="sf-link">
                {index + 1}. {section.title}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-6">
        {GUIDE_SECTIONS.map((section) => (
          <section
            key={section.anchor}
            id={section.anchor}
            aria-labelledby={`guide-${section.anchor}-heading`}
            className="scroll-mt-24 rounded-xl border border-border bg-surface p-4 shadow-sm"
          >
            <h2
              id={`guide-${section.anchor}-heading`}
              className="text-xl font-semibold tracking-tight"
            >
              {section.title}
            </h2>
            <p className="mt-1 text-sm font-medium text-ink-body">{section.lead}</p>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 40)} className="mt-2 text-sm text-ink-soft">
                {paragraph}
              </p>
            ))}
            <p className="mt-3 text-xs text-ink-muted">
              Where to see it:{' '}
              {section.seeAlso.map((link, index) => (
                <span key={link.href}>
                  {index > 0 ? ' · ' : ''}
                  <Link href={link.href} className="sf-link">
                    {link.label}
                  </Link>
                </span>
              ))}
            </p>
          </section>
        ))}
      </div>
    </main>
  );
}
