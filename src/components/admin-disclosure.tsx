import type { ReactNode } from 'react';

export interface AdminDisclosureProps {
  title: string;
  description: string;
  children: ReactNode;
}

/**
 * A quiet, native disclosure for infrequently used administration tools.
 * Native details/summary keeps the control keyboard-accessible and usable
 * without adding another client-side island to this mostly server-rendered
 * page.
 */
export function AdminDisclosure({ title, description, children }: AdminDisclosureProps) {
  return (
    <details className="group bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-sm font-semibold text-ink">{title}</span>
          <span className="mt-0.5 block text-xs leading-5 text-ink-muted">{description}</span>
        </span>
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-canvas text-ink-soft transition-colors group-hover:border-border-strong"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className="h-4 w-4 transition-transform duration-150 group-open:rotate-180"
          >
            <path
              d="m5 7.5 5 5 5-5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </summary>
      <div className="border-t border-border bg-canvas/35 px-5 py-5">{children}</div>
    </details>
  );
}
