import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BUSINESS_TIMEZONE,
  endOfLocalDate,
  formatDayMonthLocalDate,
  formatOrdinalDayMonthShortLocalDate,
  formatRelativeAge,
  formatShortLocalDate,
  isValidLocalDate,
  ordinalDay,
  toLocalDateString,
} from '../src/lib/time';

describe('formatRelativeAge', () => {
  const now = new Date('2026-09-20T17:00:00Z');

  it('says "just now" for anything under a minute', () => {
    assert.equal(formatRelativeAge(new Date('2026-09-20T16:59:30Z'), now), 'just now');
    assert.equal(formatRelativeAge(new Date('2026-09-20T17:00:00Z'), now), 'just now');
  });

  it('handles minutes and hours with singular/plural', () => {
    assert.equal(formatRelativeAge(new Date('2026-09-20T16:59:00Z'), now), '1 minute ago');
    assert.equal(formatRelativeAge(new Date('2026-09-20T16:45:00Z'), now), '15 minutes ago');
    assert.equal(formatRelativeAge(new Date('2026-09-20T16:00:00Z'), now), '1 hour ago');
    assert.equal(formatRelativeAge(new Date('2026-09-20T13:00:00Z'), now), '4 hours ago');
  });

  it('handles days and weeks', () => {
    assert.equal(formatRelativeAge(new Date('2026-09-19T17:00:00Z'), now), '1 day ago');
    assert.equal(formatRelativeAge(new Date('2026-09-15T17:00:00Z'), now), '5 days ago');
    assert.equal(formatRelativeAge(new Date('2026-09-08T17:00:00Z'), now), '12 days ago');
    assert.equal(formatRelativeAge(new Date('2026-08-30T17:00:00Z'), now), '3 weeks ago');
  });

  it('never claims the future', () => {
    assert.equal(formatRelativeAge(new Date('2026-09-20T17:30:00Z'), now), 'just now');
  });
});

describe('local dates (Phase 2a backdating)', () => {
  it('validates YYYY-MM-DD strictly, including impossible calendar dates', () => {
    assert.equal(isValidLocalDate('2026-09-24'), true);
    assert.equal(isValidLocalDate('2024-02-29'), true); // leap day exists in 2024
    assert.equal(isValidLocalDate('2026-02-29'), false);
    assert.equal(isValidLocalDate('2026-02-30'), false);
    assert.equal(isValidLocalDate('2026-13-01'), false);
    assert.equal(isValidLocalDate('2026-00-10'), false);
    assert.equal(isValidLocalDate('2026-9-4'), false);
    assert.equal(isValidLocalDate('24/09/2026'), false);
    assert.equal(isValidLocalDate(''), false);
    assert.equal(isValidLocalDate('2026-09-24T10:00'), false);
  });

  it('renders the business-timezone date across the UTC-midnight boundary', () => {
    // Late September is BST (UTC+1): 23:30Z is already tomorrow locally.
    assert.equal(toLocalDateString(new Date('2026-09-20T22:30:00Z')), '2026-09-20');
    assert.equal(toLocalDateString(new Date('2026-09-20T23:30:00Z')), '2026-09-21');
    // Mid-January is GMT: local and UTC dates agree.
    assert.equal(toLocalDateString(new Date('2026-01-15T00:30:00Z')), '2026-01-15');
    assert.equal(toLocalDateString(new Date('2026-01-15T23:30:00Z')), '2026-01-15');
  });

  it('ends a date-only fact at the last local millisecond (SPEC §5)', () => {
    // BST: 23:59:59.999+01:00 is 22:59:59.999Z.
    assert.equal(endOfLocalDate('2026-09-24').toISOString(), '2026-09-24T22:59:59.999Z');
    // GMT: 23:59:59.999+00:00 is 23:59:59.999Z.
    assert.equal(endOfLocalDate('2026-01-15').toISOString(), '2026-01-15T23:59:59.999Z');
    // Round-trips back to the same local date.
    assert.equal(toLocalDateString(endOfLocalDate('2026-09-24')), '2026-09-24');
    assert.equal(toLocalDateString(endOfLocalDate('2026-01-15')), '2026-01-15');
  });

  it('stays correct on both 2026 DST transition days', () => {
    // Clocks go forward on 2026-03-29 and back on 2026-10-25 (Europe/London);
    // 23:59 is far from the 01:00 transition either way.
    for (const date of ['2026-03-29', '2026-10-25']) {
      const end = endOfLocalDate(date);
      assert.equal(toLocalDateString(end), date);
      const wall = new Intl.DateTimeFormat('en-GB', {
        timeZone: BUSINESS_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(end);
      assert.equal(wall, '23:59:59');
      assert.equal(end.getMilliseconds(), 999);
    }
  });

  it('rejects malformed dates loudly', () => {
    assert.throws(() => endOfLocalDate('2026-02-30'), /Expected a local date/);
    assert.throws(() => endOfLocalDate('not-a-date'), /Expected a local date/);
  });
});

describe('formatShortLocalDate', () => {
  it('renders a local date as a short weekday label, whatever the timezone', () => {
    assert.equal(formatShortLocalDate('2026-09-30'), 'Wed 30 Sept');
    assert.equal(formatShortLocalDate('2026-09-27'), 'Sun 27 Sept');
    assert.equal(formatShortLocalDate('2026-10-02'), 'Fri 2 Oct');
  });

  it('returns the input unchanged when it is not a local date', () => {
    assert.equal(formatShortLocalDate('not-a-date'), 'not-a-date');
  });
});

describe('ordinalDay', () => {
  it('reads a day of the month as a day', () => {
    assert.equal(ordinalDay(1), '1st');
    assert.equal(ordinalDay(2), '2nd');
    assert.equal(ordinalDay(3), '3rd');
    assert.equal(ordinalDay(21), '21st');
    assert.equal(ordinalDay(22), '22nd');
    assert.equal(ordinalDay(23), '23rd');
  });

  it('spells the teens with -th (11th, not 11st)', () => {
    assert.equal(ordinalDay(11), '11th');
    assert.equal(ordinalDay(12), '12th');
    assert.equal(ordinalDay(13), '13th');
    assert.equal(ordinalDay(111), '111th');
  });
});

describe('formatDayMonthLocalDate', () => {
  it('spells the day and the month for the payday sentence', () => {
    assert.equal(formatDayMonthLocalDate('2026-10-26', '2026-10-08'), '26th October');
    assert.equal(formatDayMonthLocalDate('2026-10-21', '2026-10-08'), '21st October');
    assert.equal(formatDayMonthLocalDate('2026-03-01', '2026-03-01'), '1st March');
  });

  it('carries the year when the date is not in today’s year', () => {
    assert.equal(formatDayMonthLocalDate('2027-01-26', '2026-12-30'), '26th January 2027');
    assert.equal(formatDayMonthLocalDate('2026-12-31', '2026-12-30'), '31st December');
  });

  it('returns the input unchanged when it is not a local date', () => {
    assert.equal(formatDayMonthLocalDate('not-a-date', '2026-10-08'), 'not-a-date');
  });
});

describe('formatOrdinalDayMonthShortLocalDate', () => {
  it('formats the payday heading as an ordinal day and abbreviated month', () => {
    assert.equal(formatOrdinalDayMonthShortLocalDate('2026-10-26', '2026-10-09'), '26th Oct');
    assert.equal(formatOrdinalDayMonthShortLocalDate('2026-10-01', '2026-10-09'), '1st Oct');
  });

  it('adds the year when the payday is in a different year', () => {
    assert.equal(formatOrdinalDayMonthShortLocalDate('2027-01-26', '2026-12-30'), '26th Jan 2027');
  });

  it('returns the input unchanged for malformed dates', () => {
    assert.equal(formatOrdinalDayMonthShortLocalDate('not-a-date', '2026-10-09'), 'not-a-date');
  });
});
