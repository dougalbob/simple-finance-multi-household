'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Old `/pots#debt-{id}` bookmarks name a debt panel that moved to the
 * Borrowing page (GitHub issue #60). A fragment never reaches the server, so
 * the forward has to happen in the browser: when the pots page loads carrying
 * a `#debt-…` hash, it rewrites to `/borrowing` with the same hash — the
 * summary strip's debt anchors are named exactly as they were. Anything else
 * is left alone.
 */
export function BorrowingMovedRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!window.location.hash.startsWith('#debt-')) return;
    router.replace(`/borrowing${window.location.hash}`);
  }, [router, pathname]);
  return null;
}
