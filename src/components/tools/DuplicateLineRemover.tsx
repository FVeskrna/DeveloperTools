import { useEffect, useMemo, useRef, useState } from 'react';
import { CopyButton, FieldLabel, OutputPane, useSweep } from './ui';

type Sort = 'none' | 'asc' | 'desc';

const SAMPLE = `alpha@example.com
bravo@example.com
alpha@example.com
  Charlie@example.com
charlie@example.com
delta@example.com

bravo@example.com`;

export default function DuplicateLineRemover() {
  const [input, setInput] = useState(SAMPLE);
  const [trim, setTrim] = useState(true);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [dropEmpty, setDropEmpty] = useState(true);
  const [sort, setSort] = useState<Sort>('none');
  const [sweep, triggerSweep] = useSweep();
  const lastGood = useRef('');

  const result = useMemo(() => {
    const lines = input.split(/\r?\n/);
    const seen = new Set<string>();
    const kept: string[] = [];
    let removed = 0;
    let empties = 0;
    for (const raw of lines) {
      const line = trim ? raw.trim() : raw;
      if (dropEmpty && line === '') {
        empties++;
        continue;
      }
      const key = ignoreCase ? line.toLowerCase() : line;
      if (seen.has(key)) {
        removed++;
        continue;
      }
      seen.add(key);
      kept.push(line);
    }
    if (sort !== 'none') {
      kept.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'variant', numeric: true }));
      if (sort === 'desc') kept.reverse();
    }
    return {
      output: kept.join('\n'),
      stats: { in: lines.length, out: kept.length, removed, empties },
    };
  }, [input, trim, ignoreCase, dropEmpty, sort]);

  useEffect(() => {
    if (result.output !== lastGood.current) {
      lastGood.current = result.output;
      triggerSweep();
    }
  }, [result.output, triggerSweep]);

  const check = (label: string, value: boolean, set: (v: boolean) => void) => (
    <label className="ui-label flex cursor-pointer items-center gap-1.5">
      <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
      {label}
    </label>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        {check('TRIM WHITESPACE', trim, setTrim)}
        {check('IGNORE CASE', ignoreCase, setIgnoreCase)}
        {check('DROP EMPTY LINES', dropEmpty, setDropEmpty)}
        <label className="ui-label flex items-center gap-2">
          SORT
          <select className="field" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="none">keep order</option>
            <option value="asc">A → Z</option>
            <option value="desc">Z → A</option>
          </select>
        </label>
      </div>

      <div className="mt-4">
        <FieldLabel htmlFor="dlr-input">LINES IN</FieldLabel>
        <textarea
          id="dlr-input"
          className="field"
          rows={9}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
        />
      </div>

      <OutputPane
        sweep={sweep}
        label={`LINES: ${result.stats.in} IN · ${result.stats.out} OUT · ${result.stats.removed} DUPLICATES REMOVED${
          dropEmpty && result.stats.empties ? ` · ${result.stats.empties} EMPTY DROPPED` : ''
        }`}
        actions={<CopyButton text={() => result.output} />}
      >
        <pre
          className="field"
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', minHeight: 160, margin: 0 }}
          aria-live="polite"
        >
          {result.output}
        </pre>
      </OutputPane>
    </div>
  );
}
