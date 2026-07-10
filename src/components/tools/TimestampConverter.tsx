import { useEffect, useMemo, useRef, useState } from 'react';
import { CopyButton, ErrorLine, FieldLabel, OutputPane, useSweep } from './ui';

type Unit = 'auto' | 's' | 'ms';

function detectMs(value: number, unit: Unit): number {
  if (unit === 's') return value * 1000;
  if (unit === 'ms') return value;
  // auto: 13+ digit magnitudes are almost certainly milliseconds
  return Math.abs(value) >= 1e12 ? value : value * 1000;
}

function relativeTime(ms: number, nowMs: number): string {
  const diff = (ms - nowMs) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [3600, 'minute'],
    [86400, 'hour'],
    [86400 * 30, 'day'],
    [86400 * 365, 'month'],
    [Infinity, 'year'],
  ];
  const divisors: Record<string, number> = {
    second: 1, minute: 60, hour: 3600, day: 86400, month: 86400 * 30, year: 86400 * 365,
  };
  for (const [limit, unit] of steps) {
    if (abs < limit) return rtf.format(Math.round(diff / divisors[unit]), unit);
  }
  return rtf.format(Math.round(diff / divisors.year), 'year');
}

function formatInZone(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'shortOffset',
  }).format(new Date(ms));
}

export default function TimestampConverter() {
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [epochInput, setEpochInput] = useState('1735689600');
  const [unit, setUnit] = useState<Unit>('auto');
  const [timeZone, setTimeZone] = useState('UTC');
  const [zones, setZones] = useState<string[]>(['UTC']);
  const [humanInput, setHumanInput] = useState('2026-07-06T12:00:00Z');
  const [sweep, triggerSweep] = useSweep();
  const lastResult = useRef('');

  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    try {
      const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const all: string[] =
        'supportedValuesOf' in Intl ? (Intl as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone') : [];
      const head = ['UTC', ...(local && local !== 'UTC' ? [local] : [])];
      setZones([...head, ...all.filter((z) => !head.includes(z))]);
      if (local) setTimeZone(local);
    } catch {
      /* keep UTC-only fallback */
    }
    return () => clearInterval(id);
  }, []);

  const epoch = useMemo<{ ok: true; ms: number } | { ok: false; error: string }>(() => {
    const trimmed = epochInput.trim();
    if (!trimmed) return { ok: false, error: 'Enter a timestamp.' };
    const value = Number(trimmed);
    if (!Number.isFinite(value)) return { ok: false, error: 'Not a number.' };
    const ms = detectMs(value, unit);
    if (Math.abs(ms) > 8.64e15) return { ok: false, error: 'Out of range for a date.' };
    return { ok: true, ms };
  }, [epochInput, unit]);

  const human = useMemo<{ ok: true; ms: number } | { ok: false; error: string }>(() => {
    const trimmed = humanInput.trim();
    if (!trimmed) return { ok: false, error: 'Enter a date.' };
    const ms = Date.parse(trimmed);
    if (Number.isNaN(ms))
      return { ok: false, error: 'Unrecognized date format. Try ISO 8601, e.g. 2026-07-06T12:00:00Z.' };
    return { ok: true, ms };
  }, [humanInput]);

  useEffect(() => {
    if (epoch.ok) {
      const key = `${epoch.ms}|${timeZone}`;
      if (key !== lastResult.current) {
        lastResult.current = key;
        triggerSweep();
      }
    }
  }, [epoch, timeZone, triggerSweep]);

  const nowSec = nowMs === null ? null : Math.floor(nowMs / 1000);

  return (
    <div>
      <div className="hairline-b flex flex-wrap items-center justify-between gap-3 pb-4">
        <div className="flex items-baseline gap-3">
          <span className="ui-label">NOW:</span>
          <span className="tabular" style={{ fontFamily: 'var(--font-mono)', fontSize: 18 }} aria-live="off">
            {nowSec ?? '··········'}
          </span>
          <span className="ui-label">UNIX SECONDS</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn"
            onClick={() => nowSec !== null && setEpochInput(String(nowSec))}
          >
            USE NOW
          </button>
          <CopyButton text={() => String(nowSec ?? '')} label="COPY NOW" />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <FieldLabel htmlFor="ts-epoch">EPOCH TIMESTAMP</FieldLabel>
          <input
            id="ts-epoch"
            className="field tabular"
            value={epochInput}
            onChange={(e) => setEpochInput(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
          />
        </div>
        <div>
          <FieldLabel htmlFor="ts-unit">UNIT</FieldLabel>
          <select id="ts-unit" className="field" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            <option value="auto">auto-detect</option>
            <option value="s">seconds</option>
            <option value="ms">milliseconds</option>
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="ts-zone">TIME ZONE</FieldLabel>
          <select id="ts-zone" className="field" value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!epoch.ok && <ErrorLine>{epoch.error}</ErrorLine>}

      <OutputPane
        sweep={sweep}
        label="CONVERTED"
        actions={epoch.ok ? <CopyButton text={() => new Date(epoch.ms).toISOString()} label="COPY ISO" /> : undefined}
      >
        {epoch.ok ? (
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]" style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            <dt className="ui-label">ISO 8601 (UTC)</dt>
            <dd>{new Date(epoch.ms).toISOString()}</dd>
            <dt className="ui-label">{timeZone.toUpperCase()}</dt>
            <dd>{formatInZone(epoch.ms, timeZone)}</dd>
            <dt className="ui-label">RELATIVE</dt>
            <dd>{nowMs === null ? '—' : relativeTime(epoch.ms, nowMs)}</dd>
            <dt className="ui-label">SECONDS</dt>
            <dd className="tabular">{Math.floor(epoch.ms / 1000)}</dd>
            <dt className="ui-label">MILLISECONDS</dt>
            <dd className="tabular">{epoch.ms}</dd>
          </dl>
        ) : (
          <p className="ink-secondary" style={{ fontSize: 13 }}>Waiting for a valid timestamp.</p>
        )}
      </OutputPane>

      <div className="hairline-t mt-8 pt-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <FieldLabel htmlFor="ts-human">DATE → EPOCH (ISO 8601 or RFC 2822)</FieldLabel>
            <input
              id="ts-human"
              className="field"
              value={humanInput}
              onChange={(e) => setHumanInput(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {human.ok && <CopyButton text={() => String(Math.floor(human.ms / 1000))} label="COPY SECONDS" />}
        </div>
        {!human.ok ? (
          <ErrorLine>{human.error}</ErrorLine>
        ) : (
          <p className="mt-3" style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            <span className="ui-label">SECONDS </span>
            <span className="tabular">{Math.floor(human.ms / 1000)}</span>
            <span className="ui-label">&ensp;·&ensp;MILLISECONDS </span>
            <span className="tabular">{human.ms}</span>
          </p>
        )}
      </div>
    </div>
  );
}
