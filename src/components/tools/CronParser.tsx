import { useEffect, useMemo, useRef, useState } from 'react';
import { compressValues, describeCron, nextRuns, parseCron } from '../../lib/cron';
import TimeZonePicker from './TimeZonePicker';
import { CopyButton, ErrorLine, FieldLabel, OutputPane, useSweep } from './ui';

const PRESETS: { label: string; expr: string }[] = [
  { label: 'EVERY 5 MIN', expr: '*/5 * * * *' },
  { label: 'HOURLY', expr: '0 * * * *' },
  { label: 'DAILY AT MIDNIGHT', expr: '0 0 * * *' },
  { label: 'WEEKDAYS 9:00', expr: '0 9 * * 1-5' },
];

const FIELD_ROWS: { key: 'minute' | 'hour' | 'dom' | 'month' | 'dow'; label: string; range: string }[] = [
  { key: 'minute', label: 'Minute', range: '0-59' },
  { key: 'hour', label: 'Hour', range: '0-23' },
  { key: 'dom', label: 'Day of month', range: '1-31' },
  { key: 'month', label: 'Month', range: '1-12' },
  { key: 'dow', label: 'Day of week', range: '0-7 (0 and 7 = Sunday)' },
];

function fmtRun(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'shortOffset',
  }).format(new Date(ms));
}

function relative(ms: number, nowMs: number): string {
  const s = Math.round((ms - nowMs) / 1000);
  if (s < 90) return `in ${s}s`;
  if (s < 5400) return `in ${Math.round(s / 60)} min`;
  if (s < 48 * 3600) return `in ${Math.round(s / 3600)} h`;
  return `in ${Math.round(s / 86400)} days`;
}

export default function CronParser() {
  const [expr, setExpr] = useState('*/15 * * * *');
  const [timeZone, setTimeZone] = useState('UTC');
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [sweep, triggerSweep] = useSweep();
  const lastGood = useRef('');

  useEffect(() => {
    setNowMs(Date.now());
    try {
      const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (local) setTimeZone(local);
    } catch {
      /* UTC fallback */
    }
  }, []);

  const parsed = useMemo(() => parseCron(expr), [expr]);
  const description = parsed.ok ? describeCron(parsed.cron) : null;

  const runs = useMemo(() => {
    if (!parsed.ok || nowMs === null) return [];
    try {
      return nextRuns(parsed.cron, 5, timeZone, nowMs);
    } catch {
      return [];
    }
  }, [parsed, timeZone, nowMs]);

  useEffect(() => {
    if (description && description !== lastGood.current) {
      lastGood.current = description;
      triggerSweep();
    }
  }, [description, triggerSweep]);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <FieldLabel htmlFor="cron-expr">CRON EXPRESSION (5 FIELDS)</FieldLabel>
          <input
            id="cron-expr"
            className="field tabular"
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <TimeZonePicker id="cron-tz" value={timeZone} onChange={setTimeZone} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="ui-label">PRESETS:</span>
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className="btn" onClick={() => setExpr(p.expr)}>
            {p.label}
          </button>
        ))}
      </div>

      {!parsed.ok && <ErrorLine>{parsed.error}</ErrorLine>}

      <OutputPane
        sweep={sweep}
        label="READS AS"
        actions={description ? <CopyButton text={() => description} label="COPY DESCRIPTION" /> : undefined}
      >
        {parsed.ok ? (
          <div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 500 }} aria-live="polite">
              {description}
            </p>

            <p className="ui-label mt-5 mb-1.5">NEXT 5 RUNS · {timeZone.toUpperCase()}</p>
            {nowMs === null || runs.length === 0 ? (
              <p className="ink-secondary" style={{ fontSize: 13 }}>
                {nowMs === null ? 'Computing…' : 'No runs found in the next 5 years.'}
              </p>
            ) : (
              <ol className="tabular" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.9, listStyle: 'none', margin: 0 }}>
                {runs.map((r) => (
                  <li key={r}>
                    {fmtRun(r, timeZone)}
                    <span className="ink-secondary"> · {relative(r, nowMs)}</span>
                  </li>
                ))}
              </ol>
            )}

            <div className="mt-5 overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['FIELD', 'EXPRESSION', 'MATCHES'].map((h) => (
                      <th key={h} className="ui-label hairline-b" style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FIELD_ROWS.map((row) => {
                    const field = parsed.cron[row.key];
                    return (
                      <tr key={row.key}>
                        <td className="hairline-b" style={{ padding: '6px 10px' }}>
                          {row.label} <span className="ink-secondary">({row.range})</span>
                        </td>
                        <td className="hairline-b tabular" style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>
                          {field.raw}
                        </td>
                        <td className="hairline-b tabular" style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)' }}>
                          {field.restricted ? compressValues(field.values) : 'every value'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="ink-secondary" style={{ fontSize: 13 }}>Waiting for a valid 5-field expression.</p>
        )}
      </OutputPane>
    </div>
  );
}
