'use client';

import { useState } from 'react';
import {
  ExternalMovementEditForm,
  VoidSwapPairForm,
  type EditableMovement,
} from '@/components/external-forms';
import { VoidForm } from '@/components/record-forms';
import { formatPence } from '@/lib/money';
import {
  describeBoundaryMovement,
  describeSwapLeg,
  leadingLeg,
  nestedLeg,
  swapPairStatus,
  type ExternalHistoryEntry,
  type SwapHistoryEntry,
} from '@/lib/records/external-history';
import { describeExternalMovement, type ExternalMovement } from '@/lib/records/external-movements';

interface PotOption {
  id: number;
  label: string;
}

/** Which leg's inline panel is open, and which one — one at a time in the list. */
type OpenPanel = { legId: number; mode: 'edit' | 'void' } | null;

const editButtonClass =
  'rounded border border-border-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink-body hover:bg-canvas';
const voidButtonClass =
  'rounded border border-danger-200 bg-surface px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger-50';

/**
 * The row grid, shared by every line in the history so the columns line up:
 * on a phone the gutter, date and amount share the first line and the
 * description and its Edit/Void buttons drop beneath it; from `sm` up all
 * five sit on one line — gutter, date, description, amount, buttons.
 */
const rowGridClass =
  'grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-baseline gap-x-2 gap-y-1 px-3 py-2 text-sm sm:grid-cols-[1.25rem_auto_minmax(0,1fr)_auto_auto] sm:gap-x-3';

/**
 * The boundary history's rows (SPEC §10.2, GitHub issue #65). A swap's two
 * legs are drawn as **one nested object** — the money-in leg on top, the
 * money-out leg indented beneath it behind a pointer arrow and on the
 * alternate row shade, the pair's honest net and its pair-level void in a
 * footer — so the household sees a swap rather than two entries that happen to
 * share a date. Each leg keeps its own **Edit** and **Void**, opening inline
 * beneath that leg exactly as the retired "Recent swaps" list did, and other
 * money is drawn as a single row with the same two controls: this panel is the
 * one place on Accounts, Pots & Checkpoints where a boundary record is
 * corrected or voided.
 *
 * Everything decidable without a browser is decided in
 * `src/lib/records/external-history.ts`; this file draws it and holds which
 * leg's panel is open. Opening a panel never writes anything, so no URL
 * parameter carries it — a save repaints the page and the panel simply closes,
 * which is the honest end of a correction.
 */
export function ExternalHistoryList({
  entries,
  pots,
  today,
  pinnedId = null,
}: {
  entries: ExternalHistoryEntry[];
  pots: PotOption[];
  today: string;
  /** The record a `?external={id}` deep link asked for, tinted where it sits. */
  pinnedId?: number | null;
}) {
  const potLabels = new Map(pots.map((pot) => [pot.id, pot.label]));
  const [open, setOpen] = useState<OpenPanel>(null);
  const toggle = (legId: number, mode: 'edit' | 'void') =>
    setOpen((current) =>
      current?.legId === legId && current.mode === mode ? null : { legId, mode },
    );
  if (entries.length === 0) {
    return <p className="text-sm text-ink-muted">Nothing recorded yet.</p>;
  }
  return (
    <ul className="divide-y divide-border-hairline">
      {entries.map((entry) =>
        entry.kind === 'swap' ? (
          <li key={entry.key} className="py-2">
            <SwapPair
              entry={entry}
              pots={pots}
              potLabels={potLabels}
              today={today}
              open={open}
              onToggle={toggle}
              pinnedId={pinnedId}
            />
          </li>
        ) : (
          <li key={entry.key} className="py-2">
            <MovementRow
              movement={entry.movement}
              pots={pots}
              potLabel={potLabels.get(entry.movement.potId) ?? null}
              today={today}
              open={open}
              onToggle={toggle}
              pinned={entry.movement.id === pinnedId}
            />
          </li>
        ),
      )}
    </ul>
  );
}

function SwapPair({
  entry,
  pots,
  potLabels,
  today,
  open,
  onToggle,
  pinnedId,
}: {
  entry: SwapHistoryEntry;
  pots: PotOption[];
  potLabels: Map<number, string>;
  today: string;
  open: OpenPanel;
  onToggle: (legId: number, mode: 'edit' | 'void') => void;
  pinnedId: number | null;
}) {
  const lead = leadingLeg(entry);
  const nested = nestedLeg(entry);
  const status = swapPairStatus(entry);
  const bothLive =
    entry.inLeg !== null &&
    entry.inLeg.voidedAt === null &&
    entry.outLeg !== null &&
    entry.outLeg.voidedAt === null;
  const amount = entry.inLeg?.amountPence ?? entry.outLeg?.amountPence ?? 0;
  const counterparty = entry.inLeg?.counterparty ?? entry.outLeg?.counterparty ?? '—';
  return (
    <div
      data-swap-pair={entry.exchangeKey}
      className="overflow-hidden rounded-lg border border-border"
    >
      {lead !== null ? (
        <LegRow
          leg={lead}
          potLabel={potLabels.get(lead.potId) ?? null}
          pots={pots}
          today={today}
          open={open}
          onToggle={onToggle}
          pinned={lead.id === pinnedId}
        />
      ) : null}
      {nested !== null ? (
        <LegRow
          leg={nested}
          potLabel={potLabels.get(nested.potId) ?? null}
          pots={pots}
          today={today}
          nested
          open={open}
          onToggle={onToggle}
          pinned={nested.id === pinnedId}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-hairline bg-surface-muted px-3 py-1.5">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            status.tone === 'voided'
              ? 'bg-surface-muted text-ink-muted'
              : status.tone === 'balanced'
                ? 'bg-positive-50 text-positive-800'
                : 'bg-warning-50 text-warning'
          }`}
        >
          {status.label}
        </span>
        {bothLive && entry.inLeg !== null && entry.outLeg !== null ? (
          <VoidSwapPairForm
            idPrefix={`swap-void-${entry.exchangeKey.slice(0, 8)}`}
            exchangeKey={entry.exchangeKey}
            inLeg={{ id: entry.inLeg.id, version: entry.inLeg.version }}
            outLeg={{ id: entry.outLeg.id, version: entry.outLeg.version }}
            summary={`${formatPence(amount)} with ${counterparty}`}
          />
        ) : null}
      </div>
    </div>
  );
}

/** One leg of a swap, with its own Edit and Void opening beneath it. */
function LegRow({
  leg,
  potLabel,
  pots,
  today,
  nested = false,
  open,
  onToggle,
  pinned,
}: {
  leg: ExternalMovement;
  potLabel: string | null;
  pots: PotOption[];
  today: string;
  nested?: boolean;
  open: OpenPanel;
  onToggle: (legId: number, mode: 'edit' | 'void') => void;
  pinned: boolean;
}) {
  return (
    <>
      <div
        id={`external-${leg.id}`}
        className={`sf-anchor ${rowGridClass} ${
          pinned
            ? 'bg-accent-50'
            : nested
              ? 'border-t border-border-hairline bg-canvas'
              : 'bg-surface'
        } ${leg.voidedAt !== null ? 'text-ink-faint' : ''}`}
      >
        <span className="relative col-start-1 row-start-1 h-5">
          {nested ? <NestedLegArrow /> : null}
        </span>
        <span className="col-start-2 row-start-1 tabular-nums text-ink-muted sm:col-start-2">
          {leg.occurredDate}
        </span>
        <span
          className={`col-start-3 row-start-1 justify-self-end tabular-nums font-medium sm:col-start-4 ${
            leg.direction === 'in' ? 'text-positive' : 'text-danger'
          }`}
        >
          {leg.direction === 'in' ? '+' : '−'}
          {formatPence(leg.amountPence)}
        </span>
        <span className="col-span-2 col-start-2 row-start-2 min-w-0 break-words sm:col-span-1 sm:col-start-3 sm:row-start-1">
          <span className={leg.voidedAt !== null ? 'line-through' : undefined}>
            {describeSwapLeg(leg, potLabel)}
          </span>
          {leg.note !== null && leg.note !== '' ? (
            <span className="text-ink-muted"> — {leg.note}</span>
          ) : null}
          <span className="ml-1 text-xs text-ink-muted">· {leg.enteredBy}</span>
          <VoidedNote movement={leg} />
        </span>
        <span className="col-span-2 col-start-2 row-start-3 flex flex-wrap gap-1.5 sm:col-span-1 sm:col-start-5 sm:row-start-1">
          <LegControls leg={leg} open={open} onToggle={onToggle} />
        </span>
      </div>
      <LegPanel leg={leg} pots={pots} today={today} open={open} />
    </>
  );
}

/** Other money across the boundary — one row, the same Edit and Void. */
function MovementRow({
  movement,
  pots,
  potLabel,
  today,
  open,
  onToggle,
  pinned,
}: {
  movement: ExternalMovement;
  pots: PotOption[];
  potLabel: string | null;
  today: string;
  open: OpenPanel;
  onToggle: (legId: number, mode: 'edit' | 'void') => void;
  pinned: boolean;
}) {
  return (
    <>
      <div
        id={`external-${movement.id}`}
        className={`sf-anchor ${rowGridClass} ${pinned ? 'bg-accent-50' : ''} ${
          movement.voidedAt !== null ? 'text-ink-faint' : ''
        }`}
      >
        <span className="col-start-1 row-start-1 h-5" />
        <span className="col-start-2 row-start-1 tabular-nums text-ink-muted sm:col-start-2">
          {movement.occurredDate}
        </span>
        <span
          className={`col-start-3 row-start-1 justify-self-end tabular-nums font-medium sm:col-start-4 ${
            movement.direction === 'in' ? 'text-positive' : 'text-danger'
          }`}
        >
          {movement.direction === 'in' ? '+' : '−'}
          {formatPence(movement.amountPence)}
        </span>
        <span className="col-span-2 col-start-2 row-start-2 min-w-0 break-words sm:col-span-1 sm:col-start-3 sm:row-start-1">
          <span className={movement.voidedAt !== null ? 'line-through' : undefined}>
            {describeBoundaryMovement(movement, potLabel)}
          </span>
          {movement.note !== null && movement.note !== '' ? (
            <span className="text-ink-muted"> — {movement.note}</span>
          ) : null}
          <span className="ml-1 text-xs text-ink-muted">· {movement.enteredBy}</span>
          <VoidedNote movement={movement} />
        </span>
        <span className="col-span-2 col-start-2 row-start-3 flex flex-wrap gap-1.5 sm:col-span-1 sm:col-start-5 sm:row-start-1">
          <LegControls leg={movement} open={open} onToggle={onToggle} />
        </span>
      </div>
      <LegPanel leg={movement} pots={pots} today={today} open={open} />
    </>
  );
}

/** Why a record stopped counting, said inside its own row. */
function VoidedNote({ movement }: { movement: ExternalMovement }) {
  if (movement.voidedAt === null) return null;
  return (
    <span className="mt-0.5 block text-xs">
      voided{movement.voidReason ? ` — ${movement.voidReason}` : ''}
    </span>
  );
}

/**
 * The leg's correction or void, opening inline **beneath that leg** — the
 * behaviour the household already knew from the "Recent swaps" list, which
 * issue #65 retired in favour of this single place to edit a swap.
 */
function LegPanel({
  leg,
  pots,
  today,
  open,
}: {
  leg: ExternalMovement;
  pots: PotOption[];
  today: string;
  open: OpenPanel;
}) {
  if (open?.legId !== leg.id) return null;
  if (open.mode === 'edit') {
    return (
      <div className="border-t border-border-hairline bg-surface-muted px-3 py-3">
        <ExternalMovementEditForm
          idPrefix={`history-edit-${leg.id}`}
          movement={leg as EditableMovement}
          pots={pots}
          today={today}
        />
      </div>
    );
  }
  return (
    <div className="border-t border-border-hairline bg-surface-muted px-3 py-3">
      <VoidForm
        kind="external"
        recordId={leg.id}
        expectedVersion={leg.version}
        summary={describeExternalMovement(leg)}
      />
    </div>
  );
}

function LegControls({
  leg,
  open,
  onToggle,
}: {
  leg: ExternalMovement;
  open: OpenPanel;
  onToggle: (legId: number, mode: 'edit' | 'void') => void;
}) {
  if (leg.voidedAt !== null) return null;
  return (
    <>
      <button
        type="button"
        aria-expanded={open?.legId === leg.id && open.mode === 'edit'}
        aria-controls={`external-${leg.id}`}
        onClick={() => onToggle(leg.id, 'edit')}
        className={editButtonClass}
      >
        Edit
      </button>
      <button
        type="button"
        aria-expanded={open?.legId === leg.id && open.mode === 'void'}
        aria-controls={`external-${leg.id}`}
        onClick={() => onToggle(leg.id, 'void')}
        className={voidButtonClass}
      >
        Void
      </button>
    </>
  );
}

/**
 * The pointer that introduces a swap's nested leg: a vertical leg joining the
 * row above, a short horizontal leg and a right-pointing arrowhead. It is
 * absolutely placed inside the row's own gutter cell, so it can rise through
 * the row's top border to meet the parent row without making the nested row
 * taller than the one above it.
 */
function NestedLegArrow() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 28"
      className="pointer-events-none absolute -top-2 left-0 h-7 w-5 text-border-emphasis"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 0 V18 H15" />
      <path d="M12 15 L15 18 L12 21" />
    </svg>
  );
}
