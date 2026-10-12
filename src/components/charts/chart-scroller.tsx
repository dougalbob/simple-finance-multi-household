'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

/**
 * Horizontal scroll chrome for a chart drawing that can grow wider than its
 * column (SPEC §16.7 F, decision 201).
 *
 * The swipe is the browser's own overflow scrolling: nothing here listens to
 * touch, so a finger drag keeps the platform's 1:1 tracking and momentum and
 * there is no script (and no haptic, and no scroll-snap) fighting it. What
 * this component adds is progressive enhancement only — small ◀ ▶ nudges for
 * a tap or a click, and a pointer drag for a desktop mouse. With JavaScript
 * switched off the drawing still scrolls natively and the table twin still
 * carries every figure.
 */

const CHEVRON_LEFT = 'M15 19l-7-7 7-7';
const CHEVRON_RIGHT = 'M9 5l7 7-7 7';

export function ChartScroller({ children, label }: { children: ReactNode; label: string }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: number; x: number; left: number; moved: boolean } | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const measure = useCallback(() => {
    const el = frameRef.current;
    if (el === null) return;
    const max = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(max <= 2 || el.scrollLeft >= max - 2);
  }, []);

  useEffect(() => {
    const el = frameRef.current;
    if (el === null) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', measure);
    };
  }, [measure]);

  const nudge = (direction: -1 | 1): void => {
    const el = frameRef.current;
    if (el === null) return;
    const step = Math.min(320, Math.max(160, Math.round(el.clientWidth * 0.85)));
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  };

  // Desktop mouse drag. Touch is deliberately left to the platform (above).
  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const el = frameRef.current;
    if (el === null) return;
    dragRef.current = { id: event.pointerId, x: event.clientX, left: el.scrollLeft, moved: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const state = dragRef.current;
    const el = frameRef.current;
    if (state === null || el === null || event.pointerId !== state.id) return;
    const delta = event.clientX - state.x;
    if (!state.moved && Math.abs(delta) < 5) return;
    state.moved = true;
    el.scrollLeft = state.left - delta;
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    const state = dragRef.current;
    if (state === null || event.pointerId !== state.id) return;
    dragRef.current = null;
    if (!state.moved) return;
    // A drag is a drag: swallow the click that would follow it, so a bar's
    // purchases link does not open when the user was only panning.
    const swallow = (click: globalThis.MouseEvent): void => {
      click.preventDefault();
      click.stopPropagation();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
  };

  return (
    <div className="relative">
      <div
        ref={frameRef}
        data-chart-scroll
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="overflow-x-auto overscroll-x-contain"
      >
        {children}
      </div>
      {atStart ? null : (
        <button
          type="button"
          aria-label={`Scroll ${label} left`}
          onClick={() => nudge(-1)}
          className="absolute left-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border-strong bg-surface/95 text-ink shadow-sm hover:bg-canvas"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={CHEVRON_LEFT} />
          </svg>
        </button>
      )}
      {atEnd ? null : (
        <button
          type="button"
          aria-label={`Scroll ${label} right`}
          onClick={() => nudge(1)}
          className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border-strong bg-surface/95 text-ink shadow-sm hover:bg-canvas"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={CHEVRON_RIGHT} />
          </svg>
        </button>
      )}
    </div>
  );
}
