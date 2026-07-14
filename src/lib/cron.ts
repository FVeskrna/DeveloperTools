/**
 * Standard 5-field cron: minute hour day-of-month month day-of-week.
 * Supports * , ranges, steps, lists, and MON/JAN-style names. Pure JS +
 * Intl, so next-run computation honors any IANA timezone including DST.
 */

export interface CronField {
  raw: string;
  values: Set<number>;
  restricted: boolean;
}

export interface Cron {
  minute: CronField;
  hour: CronField;
  dom: CronField;
  month: CronField;
  dow: CronField;
}

export type CronParseResult = { ok: true; cron: Cron } | { ok: false; error: string };

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DOW_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface FieldSpec {
  name: string;
  min: number;
  max: number;
  names?: string[];
  nameOffset?: number;
}

const SPECS: Record<'minute' | 'hour' | 'dom' | 'month' | 'dow', FieldSpec> = {
  minute: { name: 'minute', min: 0, max: 59 },
  hour: { name: 'hour', min: 0, max: 23 },
  dom: { name: 'day-of-month', min: 1, max: 31 },
  month: { name: 'month', min: 1, max: 12, names: MONTH_NAMES, nameOffset: 1 },
  dow: { name: 'day-of-week', min: 0, max: 7, names: DOW_NAMES, nameOffset: 0 },
};

function parseValue(token: string, spec: FieldSpec): number {
  if (/^\d+$/.test(token)) return Number(token);
  if (spec.names) {
    const idx = spec.names.indexOf(token.toUpperCase());
    if (idx !== -1) return idx + (spec.nameOffset ?? 0);
  }
  throw new Error(`"${token}" is not a valid ${spec.name} value`);
}

function parseField(raw: string, spec: FieldSpec): CronField {
  const values = new Set<number>();
  let restricted = false;
  for (const item of raw.split(',')) {
    if (item === '') throw new Error(`${spec.name} field has an empty list item`);
    const stepMatch = item.match(/^(.+?)\/(\d+)$/);
    const base = stepMatch ? stepMatch[1]! : item;
    const step = stepMatch ? Number(stepMatch[2]) : 1;
    if (step === 0) throw new Error(`${spec.name} field has step 0`);

    let lo: number;
    let hi: number;
    if (base === '*') {
      lo = spec.min;
      hi = spec.max;
      if (stepMatch) restricted = true;
    } else {
      restricted = true;
      const range = base.match(/^(.+?)-(.+)$/);
      if (range) {
        lo = parseValue(range[1]!, spec);
        hi = parseValue(range[2]!, spec);
      } else {
        lo = parseValue(base, spec);
        hi = stepMatch ? spec.max : lo; // "5/15" = from 5 to max, step 15 (Vixie extension)
      }
    }
    if (lo < spec.min || hi > spec.max) {
      throw new Error(`${spec.name} value out of range ${spec.min}-${spec.max} in "${item}"`);
    }
    if (lo > hi) throw new Error(`${spec.name} range "${item}" runs backwards`);
    for (let v = lo; v <= hi; v += step) {
      // Both 0 and 7 mean Sunday in the day-of-week field.
      values.add(spec.name === 'day-of-week' && v === 7 ? 0 : v);
    }
  }
  const isFull = !restricted;
  if (isFull) {
    for (let v = spec.min; v <= (spec.name === 'day-of-week' ? 6 : spec.max); v++) values.add(v);
  }
  return { raw, values, restricted };
}

export function parseCron(expression: string): CronParseResult {
  const tokens = expression.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { ok: false, error: 'Enter a cron expression.' };
  if (tokens.length === 6) {
    return {
      ok: false,
      error:
        'This looks like a 6-field expression (leading seconds field, as used by Quartz and Spring). This parser reads standard 5-field cron — drop the seconds field to continue.',
    };
  }
  if (tokens.length === 7) {
    return {
      ok: false,
      error:
        'This looks like a 7-field Quartz expression (seconds + year). This parser reads standard 5-field cron — drop the seconds and year fields to continue.',
    };
  }
  if (tokens.length !== 5) {
    return { ok: false, error: `Standard cron has 5 fields (minute hour day-of-month month day-of-week) — found ${tokens.length}.` };
  }
  try {
    return {
      ok: true,
      cron: {
        minute: parseField(tokens[0]!, SPECS.minute),
        hour: parseField(tokens[1]!, SPECS.hour),
        dom: parseField(tokens[2]!, SPECS.dom),
        month: parseField(tokens[3]!, SPECS.month),
        dow: parseField(tokens[4]!, SPECS.dow),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** "0,15,30,45" or "9-17" — compact, sorted, range-compressed. */
export function compressValues(values: Set<number>): string {
  const sorted = [...values].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1]! === sorted[j]! + 1) j++;
    parts.push(j - i >= 2 ? `${sorted[i]}-${sorted[j]}` : sorted.slice(i, j + 1).join(', '));
    i = j + 1;
  }
  return parts.join(', ');
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function listNames(values: Set<number>, names: string[]): string {
  const sorted = [...values].sort((a, b) => a - b);
  // Contiguous run reads as "X through Y".
  const contiguous = sorted.every((v, i) => i === 0 || v === sorted[i - 1]! + 1);
  if (contiguous && sorted.length >= 3) return `${names[sorted[0]!]} through ${names[sorted[sorted.length - 1]!]}`;
  if (sorted.length === 2) return `${names[sorted[0]!]} and ${names[sorted[1]!]}`;
  return sorted.map((v) => names[v]).join(', ');
}

export function describeCron(cron: Cron): string {
  const { minute, hour, dom, month, dow } = cron;

  let time: string;
  const minStep = minute.raw.match(/^\*\/(\d+)$/);
  const hourStep = hour.raw.match(/^\*\/(\d+)$/);
  if (!minute.restricted && !hour.restricted) {
    time = 'Every minute';
  } else if (minStep && !hour.restricted) {
    time = `Every ${minStep[1]} minutes`;
  } else if (minute.values.size === 1 && hour.values.size === 1) {
    time = `At ${pad2([...hour.values][0]!)}:${pad2([...minute.values][0]!)}`;
  } else if (minute.values.size === 1 && !hour.restricted) {
    time = `At minute ${[...minute.values][0]} of every hour`;
  } else if (minute.values.size === 1 && hourStep) {
    time = `At minute ${[...minute.values][0]} past every ${hourStep[1]}th hour`;
  } else if (minute.values.size === 1) {
    time = `At minute ${[...minute.values][0]} past hour ${compressValues(hour.values)}`;
  } else if (minStep && hour.restricted) {
    time = `Every ${minStep[1]} minutes during hour ${compressValues(hour.values)}`;
  } else {
    time = `At minute ${compressValues(minute.values)} past hour ${compressValues(hour.values)}`;
  }

  const parts: string[] = [time];
  if (dom.restricted) {
    parts.push(`on day ${compressValues(dom.values)} of the month`);
  }
  if (dow.restricted) {
    parts.push(`${dom.restricted ? 'or ' : ''}on ${listNames(dow.values, DOW_FULL)}`);
  }
  if (month.restricted) {
    // Month values are 1-based; the name table is 0-indexed.
    parts.push(`in ${listNames(new Set([...month.values].map((v) => v - 1)), MONTH_FULL)}`);
  }
  return parts.join(' ');
}

/* ------------------------------------------------------------------ */
/* Next runs in an arbitrary IANA timezone                             */
/* ------------------------------------------------------------------ */

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
      hour12: false,
    });
    dtfCache.set(tz, f);
  }
  return f;
}

interface WallParts { y: number; mo: number; d: number; hh: number; mi: number; dow: number }

function wallParts(utcMs: number, tz: string): WallParts {
  const parts = dtf(tz).formatToParts(new Date(utcMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    y: Number(get('year')),
    mo: Number(get('month')),
    d: Number(get('day')),
    hh: Number(get('hour')) % 24, // "24" appears for midnight in some engines
    mi: Number(get('minute')),
    dow: DOW_NAMES.indexOf(get('weekday').toUpperCase().slice(0, 3)),
  };
}

function tzOffsetMs(utcMs: number, tz: string): number {
  const w = wallParts(utcMs, tz);
  return Date.UTC(w.y, w.mo - 1, w.d, w.hh, w.mi) - Math.floor(utcMs / 60000) * 60000;
}

/** UTC instant for a wall-clock time in tz (two-pass offset resolution for DST). */
function wallToUtc(y: number, mo: number, d: number, hh: number, mi: number, tz: string): number {
  let guess = Date.UTC(y, mo - 1, d, hh, mi);
  for (let i = 0; i < 2; i++) {
    guess = Date.UTC(y, mo - 1, d, hh, mi) - tzOffsetMs(guess, tz);
  }
  return guess;
}

function dayMatches(cron: Cron, w: WallParts): boolean {
  if (!cron.month.values.has(w.mo)) return false;
  const domOk = cron.dom.values.has(w.d);
  const dowOk = cron.dow.values.has(w.dow);
  // Standard cron: when BOTH day fields are restricted, either may match.
  if (cron.dom.restricted && cron.dow.restricted) return domOk || dowOk;
  return domOk && dowOk;
}

export function nextRuns(cron: Cron, count: number, tz: string, fromMs: number): number[] {
  const runs: number[] = [];
  const hours = [...cron.hour.values].sort((a, b) => a - b);
  const minutes = [...cron.minute.values].sort((a, b) => a - b);
  // Anchor each scanned day near its noon so a DST jump can't skip a date.
  let cursor = fromMs;
  for (let day = 0; day < 5 * 366 && runs.length < count; day++) {
    const w = wallParts(cursor, tz);
    if (dayMatches(cron, w)) {
      for (const hh of hours) {
        for (const mi of minutes) {
          const t = wallToUtc(w.y, w.mo, w.d, hh, mi, tz);
          // Re-check the date: day 31 of a 30-day month rolls over.
          const check = wallParts(t, tz);
          if (check.d !== w.d || check.mo !== w.mo) continue;
          if (t > fromMs && runs.length < count) runs.push(t);
        }
        if (runs.length >= count) break;
      }
    }
    const noon = wallToUtc(w.y, w.mo, w.d, 12, 0, tz);
    cursor = noon + 24 * 3600 * 1000;
  }
  return runs;
}
