import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'sql-formatter';
import { CopyButton, ErrorLine, FieldLabel, OutputPane, useSweep } from './ui';

const DIALECTS = [
  ['sql', 'Standard SQL'],
  ['postgresql', 'PostgreSQL'],
  ['mysql', 'MySQL'],
  ['sqlite', 'SQLite'],
  ['transactsql', 'T-SQL (SQL Server)'],
  ['plsql', 'PL/SQL (Oracle)'],
  ['bigquery', 'BigQuery'],
  ['snowflake', 'Snowflake'],
  ['mariadb', 'MariaDB'],
  ['trino', 'Trino / Presto'],
] as const;

type Dialect = (typeof DIALECTS)[number][0];
type Indent = '2' | '4' | 'tab';

const SAMPLE = `select o.id, c.name, sum(li.qty*li.unit_price) as total from orders o join customers c on c.id=o.customer_id join line_items li on li.order_id=o.id where o.status='paid' and o.created_at>='2026-01-01' group by o.id, c.name having sum(li.qty*li.unit_price)>500 order by total desc limit 20;`;

export default function SqlFormatterTool() {
  const [input, setInput] = useState(SAMPLE);
  const [dialect, setDialect] = useState<Dialect>('postgresql');
  const [indent, setIndent] = useState<Indent>('2');
  const [keywordCase, setKeywordCase] = useState<'upper' | 'preserve'>('upper');
  const [sweep, triggerSweep] = useSweep();
  const lastGood = useRef('');

  // Computed at render, so the server-rendered page already shows the
  // formatted sample — output is visible before hydration, with no shift.
  const { output, error } = useMemo(() => {
    if (!input.trim()) return { output: '', error: null };
    try {
      const result = format(input, {
        language: dialect,
        tabWidth: indent === 'tab' ? 1 : Number(indent),
        useTabs: indent === 'tab',
        keywordCase,
        linesBetweenQueries: 1,
      });
      return { output: result, error: null };
    } catch (e) {
      return { output: '', error: e instanceof Error ? e.message.split('\n')[0] : String(e) };
    }
  }, [input, dialect, indent, keywordCase]);

  useEffect(() => {
    if (output && output !== lastGood.current) {
      lastGood.current = output;
      triggerSweep();
    }
  }, [output, triggerSweep]);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <FieldLabel htmlFor="sqlf-dialect">DIALECT</FieldLabel>
          <select
            id="sqlf-dialect"
            className="field"
            value={dialect}
            onChange={(e) => setDialect(e.target.value as Dialect)}
          >
            {DIALECTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="sqlf-indent">INDENT</FieldLabel>
          <select
            id="sqlf-indent"
            className="field"
            value={indent}
            onChange={(e) => setIndent(e.target.value as Indent)}
          >
            <option value="2">2 spaces</option>
            <option value="4">4 spaces</option>
            <option value="tab">tabs</option>
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="sqlf-case">KEYWORDS</FieldLabel>
          <select
            id="sqlf-case"
            className="field"
            value={keywordCase}
            onChange={(e) => setKeywordCase(e.target.value as 'upper' | 'preserve')}
          >
            <option value="upper">UPPERCASE</option>
            <option value="preserve">preserve</option>
          </select>
        </div>
      </div>

      <div className="mt-4">
        <FieldLabel htmlFor="sqlf-input">SQL IN</FieldLabel>
        <textarea
          id="sqlf-input"
          className="field"
          rows={8}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
        />
      </div>

      {error && <ErrorLine>{error}</ErrorLine>}

      <OutputPane sweep={sweep} label="FORMATTED" actions={<CopyButton text={() => output} />}>
        <pre
          className="field"
          style={{ whiteSpace: 'pre', overflowX: 'auto', minHeight: 180, margin: 0 }}
          aria-live="polite"
        >
          {output}
        </pre>
      </OutputPane>
    </div>
  );
}
