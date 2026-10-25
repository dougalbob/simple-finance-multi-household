import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DocumentSearchForm } from '@/components/document-search-form';
import { householdContextFromRequest } from '@/lib/auth/next';
import { ATTACHMENT_SEARCH_MAX_LENGTH, searchAttachments } from '@/lib/records/attachment-search';
import { formatAttachmentSize } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Documents' };

interface DocumentsSearchParams {
  /** The debounced search box value, mirrored in the URL so a search is shareable. */
  q?: string;
}

/**
 * The app-wide Documents page (SPEC §23.5): one box over every stored
 * attachment in the signed-in household. The matching and ranking live in
 * `searchAttachments` (household-scoped through the request's verified
 * household context, `stored` rows only, capped at 100); this server page is
 * the thin shell that reads `?q=` and renders the form and its results. Each
 * result links back to the page where the document appears, with
 * `?attachment=<id>` so the target row scrolls to and rings it.
 */
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<DocumentsSearchParams>;
}) {
  const user = await householdContextFromRequest();
  if (user === null) redirect('/unauthorized');

  const params = await searchParams;
  // Same trim and cap as the search box itself; a blank query is not a filter.
  const q = (params.q ?? '').trim().slice(0, ATTACHMENT_SEARCH_MAX_LENGTH);
  const results = searchAttachments(user.db, q);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Documents</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Every stored document</h1>
        <p className="mt-1 text-sm text-ink-soft">
          One search over every receipt, invoice and letter in this household — the document&rsquo;s
          name and the record it belongs to. Rename a document where it is listed and it is found by
          that name here; open a result to land where it lives, on Purchases, Income or Suppliers.
        </p>
      </header>

      <DocumentSearchForm q={q} />

      <section aria-labelledby="documents-results-heading" className="mt-6">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <h2 id="documents-results-heading" className="text-xl font-semibold">
            {results.length} {results.length === 1 ? 'document' : 'documents'}
            {q !== '' ? ` matching “${q}”` : ''}
          </h2>
          {results.length > 0 ? (
            <span className="text-xs text-ink-muted">Newest first · at most 100 results</span>
          ) : null}
        </div>

        {results.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-strong bg-surface p-6 text-sm text-ink-soft">
            {q === '' ? (
              <>
                <p>No documents stored in this household yet.</p>
                <p className="mt-1">
                  Attach a receipt or invoice from{' '}
                  <Link href="/purchases" className="sf-link">
                    Purchases
                  </Link>
                  ,{' '}
                  <Link href="/income" className="sf-link">
                    Income
                  </Link>{' '}
                  or{' '}
                  <Link href="/suppliers" className="sf-link">
                    Suppliers
                  </Link>
                  , and it becomes searchable here.
                </p>
              </>
            ) : (
              <p>
                Nothing matches <span className="font-medium">“{q}”</span> in a document name or
                owning record.{' '}
                <Link href="/documents" className="sf-link">
                  Clear the search
                </Link>
                .
              </p>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {results.map((doc) => (
              <li key={doc.id}>
                <Link
                  href={doc.href}
                  className="block rounded-xl border border-border bg-surface px-4 py-3 shadow-sm transition-colors hover:border-border-emphasis"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink-emphasis">{doc.displayName}</p>
                      <p className="mt-1 truncate text-xs text-ink-soft">{doc.context}</p>
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-ink-muted">
                      {formatAttachmentSize(doc.sizeBytes)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
