'use client';

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { rankSearchMatches } from '@/lib/search';

/**
 * A searchable single-choice picker that keeps its options in the page.
 *
 * GitHub issues #76 and #78 asked for the same thing in two places: the
 * household's category and supplier lists have grown long enough that a
 * native `<select>` means a lot of scrolling, and both should filter as they
 * type. The rows are inline — no browser popup, no request and no library —
 * so the same behaviour reaches a phone and a laptop.
 *
 * It is a true combobox: `role="combobox"`, an inline `listbox`, arrow keys,
 * Enter, Escape and `aria-activedescendant`. While closed the field shows the
 * chosen label; **focus alone never opens the list** (the till moves focus to
 * the category on Next, and a list that opened by itself would push the rest
 * of the card down and hide the choice), but a tap, ArrowDown, Enter or the
 * first typed character starts the search. Focusing selects the label, so a
 * typist replaces it rather than appending to it. Pinned rows carry "no
 * category"/"no supplier" choices; footer rows carry "add a new supplier…",
 * so special choices survive filtering.
 */

export interface SearchPickerOption {
  /** The value the form holds (`''` is the pinned "none" choice). */
  value: string;
  /** The primary text on the row. */
  label: string;
  /** Small secondary text on the right of the row (e.g. the parent category). */
  hint?: string;
  /** The complete text shown in the closed field. Defaults to `label`. */
  displayLabel?: string;
  /** Extra text that matches but is not shown (e.g. the parent category). */
  searchText?: string;
}

export interface SearchPickerProps {
  /** The visible input's id — the caller's label points at it. */
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SearchPickerOption[];
  /** Choices shown first and never filtered (typically `value: ''`). */
  pinnedOptions?: readonly SearchPickerOption[];
  /** Choices shown last and never filtered (e.g. "Add a new supplier…"). */
  footerOptions?: readonly SearchPickerOption[];
  placeholder: string;
  listLabel: string;
  emptyMessage?: string;
  /** Renders a hidden input with this name so the form posts the choice. */
  name?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  inputClassName?: string;
  labelClassName?: string;
  /** Short help under the field, always visible. */
  hint?: string;
  required?: boolean;
  disabled?: boolean;
}

export function SearchPicker({
  id,
  label,
  value,
  onChange,
  options,
  pinnedOptions = [],
  footerOptions = [],
  placeholder,
  listLabel,
  emptyMessage = 'No matches.',
  name,
  inputRef,
  inputClassName = 'rounded border border-border-strong bg-surface px-3 py-2 text-base',
  labelClassName = 'block text-sm font-medium text-ink-body',
  hint,
  required = false,
  disabled = false,
}: SearchPickerProps) {
  const generatedId = useId();
  const listId = `${id}-${generatedId}-list`;
  const descriptionId = `${id}-${generatedId}-description`;
  const internalRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  /**
   * The list sits in the page flow, so removing it on blur moves everything
   * below it up — and the browser then delivers the tap's click to whatever
   * is now under the finger. That is the first-tap bug the till's supplier
   * typeahead already documents (decision 135): a pointer blur only *hides*
   * the list (keeping its space) until the click has landed; then it
   * collapses. A keyboard blur closes it at once.
   */
  const [closing, setClosing] = useState(false);
  const lastPointerDown = useRef(0);

  const selected =
    [...pinnedOptions, ...options, ...footerOptions].find((option) => option.value === value) ??
    null;
  const displayOf = (option: SearchPickerOption) => option.displayLabel ?? option.label;
  const matches = rankSearchMatches(options, query);
  const rendered = [...pinnedOptions, ...matches, ...footerOptions];
  const pinnedCount = pinnedOptions.length;
  const showing = open && !closing;
  const activeOption = active >= 0 ? rendered[active] : undefined;

  useEffect(() => {
    const note = () => {
      lastPointerDown.current = Date.now();
    };
    document.addEventListener('pointerdown', note, true);
    return () => document.removeEventListener('pointerdown', note, true);
  }, []);

  useEffect(() => {
    if (!closing) return;
    const finish = () => {
      setClosing(false);
      setOpen(false);
      setQuery('');
      setActive(-1);
    };
    // After the click's own handlers (and a form submit) have run.
    const afterClick = () => window.setTimeout(finish, 0);
    document.addEventListener('click', afterClick, { once: true });
    document.addEventListener('keydown', finish, { once: true });
    // A tap that never becomes a click (a scroll, a cancelled touch).
    const fallback = window.setTimeout(finish, 2500);
    return () => {
      document.removeEventListener('click', afterClick);
      document.removeEventListener('keydown', finish);
      window.clearTimeout(fallback);
    };
  }, [closing]);

  function assignInput(node: HTMLInputElement | null) {
    internalRef.current = node;
    if (inputRef !== undefined) inputRef.current = node;
  }

  function close() {
    setOpen(false);
    setQuery('');
    setActive(-1);
    setClosing(false);
  }

  function commit(option: SearchPickerOption) {
    onChange(option.value);
    close();
  }

  function openForSearch() {
    setClosing(false);
    setOpen(true);
    setQuery('');
    setActive(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'Enter') {
        event.preventDefault();
        openForSearch();
        return;
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => {
        if (rendered.length === 0) return -1;
        // With a search typed, the arrows start on the first real match —
        // never on a pinned row that is not what was being searched for.
        if (current < 0) {
          if (query.trim() !== '' && matches.length > 0) return pinnedCount;
          return 0;
        }
        return (current + 1) % rendered.length;
      });
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => {
        if (rendered.length === 0) return -1;
        return current <= 0 ? rendered.length - 1 : current - 1;
      });
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActive(rendered.length === 0 ? -1 : 0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActive(rendered.length === 0 ? -1 : rendered.length - 1);
      return;
    }
    if (event.key === 'Enter') {
      // Never submit the surrounding form mid-search. Enter picks the
      // highlighted row; with nothing highlighted it picks the first real
      // match, and only an untyped field with one row picks that row (so it
      // never silently chooses a pinned "none" row).
      event.preventDefault();
      const option =
        activeOption ??
        (query.trim() === ''
          ? rendered.length === 1
            ? rendered[0]
            : undefined
          : (matches[0] ?? undefined));
      if (option !== undefined) commit(option);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      // Focus stays; select the shown label so the next keystroke starts a
      // fresh search rather than appending to a category name.
      internalRef.current?.select();
      return;
    }
    if (event.key === 'Tab') close();
  }

  const description =
    open && selected !== null
      ? `Currently ${displayOf(selected)}. ${hint ?? 'Start typing to search.'}`
      : (hint ?? 'Type to search.');

  return (
    <div className="min-w-0">
      {name !== undefined ? <input type="hidden" name={name} value={value} /> : null}
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <input
        ref={assignInput}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          activeOption === undefined ? undefined : `${listId}-option-${active}`
        }
        aria-describedby={descriptionId}
        aria-required={required || undefined}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        disabled={disabled}
        value={open ? query : selected === null ? '' : displayOf(selected)}
        placeholder={placeholder}
        onChange={(event) => {
          if (!open) {
            setClosing(false);
            setOpen(true);
            setQuery(event.target.value);
            setActive(-1);
            return;
          }
          setQuery(event.target.value);
          setActive(-1);
        }}
        onFocus={(event) => {
          // Selecting the label is what makes typing replace it: focus alone
          // never opens the list.
          if (!open) event.currentTarget.select();
        }}
        onClick={() => {
          if (!open) openForSearch();
        }}
        onBlur={() => {
          if (Date.now() - lastPointerDown.current < 1000) {
            setClosing(true);
            return;
          }
          close();
        }}
        onKeyDown={handleKeyDown}
        className={inputClassName}
      />
      <span
        id={descriptionId}
        className={`mt-1 block text-xs ${open ? 'text-ink-muted' : 'text-ink-faint'}`}
      >
        {description}
      </span>
      {showing ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={listLabel}
          aria-hidden={closing ? true : undefined}
          className={`mt-1 max-h-64 divide-y divide-border-hairline overflow-y-auto rounded-lg border border-border bg-surface shadow-sm ${closing ? 'invisible' : ''}`}
        >
          {matches.length === 0 ? (
            <li
              role="option"
              aria-disabled="true"
              aria-selected={false}
              className="px-3 py-2.5 text-sm text-ink-muted"
            >
              {emptyMessage}
            </li>
          ) : null}
          {rendered.map((option, index) => (
            <li key={`${option.value}-${index}`}>
              <button
                type="button"
                role="option"
                id={`${listId}-option-${index}`}
                aria-label={displayOf(option)}
                aria-selected={index === active}
                // Keep the caret in the field, so a tap never has to fight
                // a blur before the click is delivered.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commit(option)}
                className={`flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                  index === active ? 'bg-accent-50' : 'hover:bg-canvas'
                }`}
              >
                <span className="min-w-0 font-medium">{option.label}</span>
                {option.hint !== undefined ? (
                  <span className="shrink-0 text-xs text-ink-muted">{option.hint}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
