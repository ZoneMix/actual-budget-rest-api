/**
 * Calendar-day windows in a named time zone, without a date library.
 *
 * Actual stamps every change with a UTC hybrid logical clock, so "the changes
 * of 2026-10-19 in Chicago" is the UTC range [local midnight, next local
 * midnight). DST days are 23 or 25 hours long; the offset is read from Intl at
 * each boundary instead of being assumed.
 */

const MS_PER_MINUTE = 60 * 1000;
// Intl longOffset labels: "GMT-05:00", "GMT+05:45", and bare "GMT" on some ICU builds.
const ZERO_OFFSET_LABEL = 'GMT';
const OFFSET_PATTERN = /^GMT([+-])(\d{2}):(\d{2})$/;

const partsOf = (instant, timeZone, options) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, ...options }).formatToParts(instant);
  return new Map(parts.map((part) => [part.type, part.value]));
};

/** UTC offset of `timeZone` at `instant`, in milliseconds (Chicago CDT: -5 h). */
const offsetMs = (instant, timeZone) => {
  const label = partsOf(instant, timeZone, { timeZoneName: 'longOffset' }).get('timeZoneName') ?? '';
  if (label === ZERO_OFFSET_LABEL) return 0;
  const match = OFFSET_PATTERN.exec(label);
  if (!match) {
    throw new Error(`Cannot read the UTC offset of time zone ${timeZone}`);
  }
  const sign = match[1] === '-' ? -1 : 1;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return sign * minutes * MS_PER_MINUTE;
};

/** The calendar date (YYYY-MM-DD) that `instant` falls on in `timeZone`. */
export const localDate = (instant, timeZone) => {
  const parts = partsOf(instant, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`;
};

const utcMidnight = (date) => {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
};

/**
 * Local midnight of `date` as a UTC instant. Two passes: the first guess uses
 * the offset at UTC midnight, the second the offset at the guess itself, which
 * settles it on every day (US transitions happen at 02:00, never at midnight).
 */
const localMidnight = (date, timeZone) => {
  const naive = utcMidnight(date);
  const guess = naive - offsetMs(new Date(naive), timeZone);
  return new Date(naive - offsetMs(new Date(guess), timeZone));
};

/**
 * @param {string} date - YYYY-MM-DD, already validated as a calendar date
 * @param {string} timeZone - IANA zone name
 * @returns {{ start: string, end: string }} ISO-8601 UTC bounds, end exclusive
 */
export const dayWindow = (date, timeZone) => {
  const nextDate = new Date(utcMidnight(date) + 24 * 60 * MS_PER_MINUTE).toISOString().slice(0, 10);
  return {
    start: localMidnight(date, timeZone).toISOString(),
    end: localMidnight(nextDate, timeZone).toISOString(),
  };
};
