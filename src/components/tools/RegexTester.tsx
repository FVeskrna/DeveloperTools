import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ErrorLine, FieldLabel, OutputPane, useSweep } from './ui';

const QUICK_PATTERNS: { label: string; pattern: string; flags: string }[] = [
  { label: 'EMAIL', pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', flags: 'g' },
  { label: 'URL', pattern: 'https?:\\/\\/[^\\s/$.?#][^\\s]*', flags: 'g' },
  {
    label: 'IPV4',
    pattern: '\\b(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\b',
    flags: 'g',
  },
];

const FLAG_DEFS: { flag: string; label: string }[] = [
  { flag: 'g', label: 'g — global' },
  { flag: 'i', label: 'i — ignore case' },
  { flag: 'm', label: 'm — multiline' },
  { flag: 's', label: 's — dotall' },
];

interface MatchRow {
  index: number;
  start: number;
  end: number;
  text: string;
  groups: { name: string; value: string }[];
}

export default function RegexTester() {
  const [pattern, setPattern] = useState('(?<user>\\w[\\w.]*)@(?<host>[\\w.-]+\\.[a-z]{2,})');
  const [flags, setFlags] = useState('g');
  const [text, setText] = useState(
    [
      'Support tickets today:',
      'jana.novak@example.com opened #4411 from 192.168.0.14',
      'ops@exacttools.dev escalated via https://status.example.com/incident/7',
      'invalid entry: not-an-email@ (rejected)',
    ].join('\n'),
  );
  const [sweep, triggerSweep] = useSweep();
  const first = useRef(true);

  const { regex, error } = useMemo(() => {
    try {
      return { regex: new RegExp(pattern, flags), error: null as string | null };
    } catch (e) {
      return { regex: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [pattern, flags]);

  const matches = useMemo<MatchRow[]>(() => {
    if (!regex || !pattern) return [];
    const rows: MatchRow[] = [];
    const collect = (m: RegExpExecArray, i: number) => {
      const groups: { name: string; value: string }[] = [];
      for (let g = 1; g < m.length; g++) groups.push({ name: `$${g}`, value: m[g] ?? '' });
      if (m.groups) {
        for (const [name, value] of Object.entries(m.groups)) groups.push({ name, value: value ?? '' });
      }
      rows.push({ index: i, start: m.index, end: m.index + m[0].length, text: m[0], groups });
    };
    if (regex.global) {
      let i = 0;
      for (const m of text.matchAll(regex)) {
        collect(m as RegExpExecArray, i++);
        if (i >= 1000) break; // sanity cap
      }
    } else {
      const m = regex.exec(text);
      if (m) collect(m, 0);
    }
    return rows;
  }, [regex, pattern, text]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      triggerSweep();
      return;
    }
    if (!error) triggerSweep();
  }, [matches, error, triggerSweep]);

  const highlighted = useMemo<ReactNode[]>(() => {
    const out: ReactNode[] = [];
    let cursor = 0;
    for (const m of matches) {
      if (m.start > cursor) out.push(text.slice(cursor, m.start));
      out.push(
        <mark key={m.index} className="match">
          {text.slice(m.start, Math.max(m.end, m.start))}
        </mark>,
      );
      cursor = Math.max(m.end, cursor);
    }
    if (cursor < text.length) out.push(text.slice(cursor));
    return out;
  }, [matches, text]);

  const toggleFlag = (f: string) =>
    setFlags((cur) => (cur.includes(f) ? cur.replace(f, '') : cur + f));

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <FieldLabel htmlFor="rx-pattern">PATTERN</FieldLabel>
          <input
            id="rx-pattern"
            className="field"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <fieldset className="flex items-center gap-3 pb-2">
          <legend className="ui-label mb-1.5">FLAGS</legend>
          {FLAG_DEFS.map((f) => (
            <label key={f.flag} className="ui-label flex cursor-pointer items-center gap-1.5" title={f.label}>
              <input
                type="checkbox"
                checked={flags.includes(f.flag)}
                onChange={() => toggleFlag(f.flag)}
                style={{ accentColor: 'var(--accent)' }}
              />
              {f.flag}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="ui-label">QUICK INSERT:</span>
        {QUICK_PATTERNS.map((q) => (
          <button
            key={q.label}
            type="button"
            className="btn"
            onClick={() => {
              setPattern(q.pattern);
              setFlags(q.flags);
            }}
          >
            {q.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <FieldLabel htmlFor="rx-text">TEST TEXT</FieldLabel>
        <textarea
          id="rx-text"
          className="field"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
      </div>

      {error && <ErrorLine>PATTERN ERROR: {error}</ErrorLine>}

      <OutputPane
        sweep={sweep}
        label={error ? 'MATCHES — WAITING FOR VALID PATTERN' : `MATCHES: ${matches.length}`}
      >
        <pre
          className="field"
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', minHeight: 120, margin: 0 }}
          aria-label="Test text with matches highlighted"
        >
          {error ? text : highlighted}
        </pre>

        {matches.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['#', 'MATCH', 'INDEX', 'GROUPS'].map((h) => (
                    <th
                      key={h}
                      className="ui-label hairline-b"
                      style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11 }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ fontFamily: 'var(--font-mono)' }}>
                {matches.slice(0, 200).map((m) => (
                  <tr key={m.index}>
                    <td className="hairline-b tabular" style={{ padding: '6px 10px' }}>
                      {m.index + 1}
                    </td>
                    <td className="hairline-b" style={{ padding: '6px 10px', wordBreak: 'break-all' }}>
                      {m.text || <span className="ink-secondary">(empty)</span>}
                    </td>
                    <td className="hairline-b tabular" style={{ padding: '6px 10px' }}>
                      {m.start}
                    </td>
                    <td className="hairline-b" style={{ padding: '6px 10px', wordBreak: 'break-all' }}>
                      {m.groups.length === 0 ? (
                        <span className="ink-secondary">—</span>
                      ) : (
                        m.groups.map((g) => `${g.name}=${g.value || '∅'}`).join('  ')
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OutputPane>
    </div>
  );
}
