'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  startTransition,
  use,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  parseOpenRowParams,
  type InPlaceKind,
  type OpenInPlaceRow,
} from '@/lib/records/in-place-activity';
import { OPEN_PURCHASE_PARAM } from '@/lib/records/purchase-activity';
import { OPEN_TRANSFER_PARAM } from '@/lib/records/transfer-activity';

/** The All Transactions table's column count — a panel row spans all of them. */
export const ACTIVITY_COLUMN_COUNT = 7;

/** Where the table's focus goes when a pinned row closes and takes its own button with it. */
export const ACTIVITY_TABLE_ID = 'activity-table';

interface OpenRowState {
  /** The record whose panel is open — at most one on the page. */
  open: OpenInPlaceRow | null;
  /** Open a record's panel, closing whichever other one was open. */
  openRow: (kind: InPlaceKind, id: number) => void;
  closeRow: () => void;
}

const OpenRowContext = createContext<OpenRowState | null>(null);

/**
 * Which record is open in place, shared by every in-place row in the table —
 * an internal transfer (decision 225) or a purchase (decision 226) — so that
 * opening one closes the other at once. The truth is the URL's
 * `?transfer={id}` / `?purchase={id}`; opening and closing replace the URL
 * through the router (`scroll: false`, no new history entry), so the page the
 * server renders — including the one it renders after a save — always knows
 * which record is open. A server round trip should not make a click feel slow,
 * so the new state shows optimistically while that navigation completes.
 *
 * Why not `history.replaceState`, which would skip the round trip: Next's
 * router would then hold the old query while the URL held the new one, and the
 * first save after opening would come back as a "different" page and scroll the
 * household away from the panel they were using.
 *
 * The two parameters are alternatives: opening one record clears the other, so
 * there is never more than one panel to reason about (`parseOpenRowParams`).
 */
export function ActivityOpenRowProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlOpen = parseOpenRowParams({
    transfer: searchParams.get(OPEN_TRANSFER_PARAM) ?? undefined,
    purchase: searchParams.get(OPEN_PURCHASE_PARAM) ?? undefined,
  });
  const [open, setOptimisticOpen] = useOptimistic(urlOpen);
  const setOpen = (next: OpenInPlaceRow | null) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(OPEN_TRANSFER_PARAM);
    params.delete(OPEN_PURCHASE_PARAM);
    if (next !== null) {
      params.set(
        next.kind === 'transfer' ? OPEN_TRANSFER_PARAM : OPEN_PURCHASE_PARAM,
        String(next.id),
      );
    }
    const query = params.toString();
    // The fragment lets a refresh (or a shared link) land on the open row.
    const fragment = next === null ? '' : `#${next.kind}-${next.id}`;
    startTransition(() => {
      setOptimisticOpen(next);
      router.replace(`${pathname}${query === '' ? '' : `?${query}`}${fragment}`, {
        scroll: false,
      });
    });
  };
  return (
    <OpenRowContext.Provider
      value={{
        open,
        openRow: (kind, id) => setOpen({ kind, id }),
        closeRow: () => setOpen(null),
      }}
    >
      {children}
    </OpenRowContext.Provider>
  );
}

/** The open record and the two ways to change it; every in-place row uses it. */
export function useActivityRow(): OpenRowState {
  const state = use(OpenRowContext);
  if (state === null) {
    throw new Error(
      'The in-place activity rows must be rendered inside an ActivityOpenRowProvider',
    );
  }
  return state;
}

/**
 * The decision 131 rule (SPEC §15.1): before React hydrates a row, a click
 * would open nothing — so its toggle is `inert` until it can hear, and says so
 * with its own `data-…-ready` attribute.
 */
export function useRowToggleReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return ready;
}

/**
 * Keep the household with the panel they are using. A correction can take the
 * open record out of the list — a purchase re-dated outside the window, a
 * transfer moved onto two other pots — and the pinned row then sits where the
 * record's own date sorts it (`withPinnedEntry`), which can be far from the
 * part of the table that was on screen. A void cannot move the row, so it
 * never needs this. When the record becomes pinned and its panel is **entirely**
 * off screen, the panel is brought back to the middle of the view once — never
 * a general scroll rule: an in-view panel, a panel the household scrolled away
 * from themselves, and a hash landing are all left exactly as they are, so the
 * page never moves under a pointer (SANDBOX 22).
 */
export function useKeepPinnedPanelInView(
  pinned: boolean,
  panelRef: RefObject<HTMLElement | null>,
): void {
  const wasPinned = useRef(false);
  useEffect(() => {
    const becamePinned = pinned && !wasPinned.current;
    wasPinned.current = pinned;
    if (!becamePinned) return;
    const panel = panelRef.current;
    if (panel === null) return;
    const box = panel.getBoundingClientRect();
    const offScreen = box.bottom <= 0 || box.top >= window.innerHeight;
    if (offScreen) panel.scrollIntoView({ block: 'center' });
  }, [pinned, panelRef]);
}

/**
 * The panel every in-place row opens beneath itself: a full-width row straight
 * after the record's own row, pinned to the visible width — as the Horizon
 * breakdown is — because the table scrolls sideways on a phone and the panel
 * must not run off the right-hand edge. The heading, its line of plain facts
 * and Close are shared; what the panel *does* is each kind's own business.
 */
export function ActivityPanel({
  id,
  title,
  subtitle,
  closeLabel = 'Close',
  onClose,
  muted = false,
  panelRef,
  children,
}: {
  /** The panel's DOM id — `{record}-{id}-panel`, the toggle's `aria-controls`. */
  id: string;
  title: ReactNode;
  subtitle: ReactNode;
  closeLabel?: string;
  onClose: () => void;
  /** A pinned row's panel is tinted as its muted row is. */
  muted?: boolean;
  panelRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  return (
    <tr className={muted ? 'bg-surface-muted/60' : 'bg-accent-50/40'}>
      <td colSpan={ACTIVITY_COLUMN_COUNT} className="px-3 pb-4 pt-1">
        <div className="sticky left-0 w-[min(calc(100vw-4rem),100%)]">
          <section
            ref={panelRef}
            id={id}
            aria-labelledby={`${id}-heading`}
            className="rounded-xl border border-border bg-surface p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id={`${id}-heading`} className="text-base font-semibold text-ink">
                  {title}
                </h3>
                <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-border-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink-body hover:bg-canvas"
              >
                {closeLabel}
              </button>
            </div>
            {children}
          </section>
        </div>
      </td>
    </tr>
  );
}
