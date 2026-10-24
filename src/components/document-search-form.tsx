'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ATTACHMENT_SEARCH_MAX_LENGTH } from '@/lib/records/attachment-search';
import { normalizeSearchText } from '@/lib/search';

/**
 * The Documents page's search box (v1.41.0). It is the only control on the
 * page: as the household types, the query is debounced and written to the URL
 * (`?q=`), so the page is shareable and a result can be opened straight from
 * a link. The debounce mirrors the Purchases search; the URL is the single
 * source of truth, and the input syncs back from it when the server renders.
 */
export function DocumentSearchForm({ q }: { q: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(q);
  /**
   * Until React has hydrated this island, a keystroke into the controlled
   * input is wiped by the hydration render and no debounced navigation can
   * fire (SPEC §15.1 · the decision 131 rule every other filter island
   * follows). The input publishes `data-doc-search-ready` and stays `inert`
   * until it is actually listening, so the browser spec waits on the signal
   * instead of typing into a dead box on a cold dev server.
   */
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The query the current render was produced from, so a keystroke does not
  // fight the server's echo of our own navigation.
  const applied = useRef(q);
  applied.current = q;

  useEffect(() => setReady(true), []);

  useEffect(() => {
    setValue((current) => (current === q ? current : q));
  }, [q]);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const change = (next: string) => {
    setValue(next);
    if (timer.current !== null) clearTimeout(timer.current);
    const trimmed = next.trim().slice(0, ATTACHMENT_SEARCH_MAX_LENGTH);
    if (normalizeSearchText(trimmed) === normalizeSearchText(applied.current)) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      const params = new URLSearchParams(searchParams.toString());
      if (trimmed === '') params.delete('q');
      else params.set('q', trimmed);
      const query = params.toString();
      router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
    }, 300);
  };

  return (
    <input
      type="search"
      value={value}
      onChange={(event) => change(event.target.value)}
      placeholder="Search documents, labels, suppliers and notes…"
      aria-label="Search documents"
      maxLength={ATTACHMENT_SEARCH_MAX_LENGTH}
      autoComplete="off"
      spellCheck={false}
      data-doc-search-ready={ready ? 'true' : 'false'}
      inert={!ready}
      className="w-full rounded border border-border-strong bg-surface px-3 py-2 text-sm focus:border-border-emphasis focus:outline-none"
    />
  );
}
