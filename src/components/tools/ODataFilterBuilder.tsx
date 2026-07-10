import { useEffect, useMemo, useRef, useState } from 'react';
import { CopyButton, ErrorLine, OutputPane, useSweep } from './ui';

type ValueType = 'string' | 'number' | 'boolean' | 'guid' | 'datetime';
type Operator =
  | 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le'
  | 'contains' | 'not-contains' | 'startswith' | 'endswith'
  | 'null' | 'not-null';

interface Row {
  id: number;
  field: string;
  op: Operator;
  value: string;
  type: ValueType;
}

const OPERATORS: { value: Operator; label: string; needsValue: boolean }[] = [
  { value: 'eq', label: 'equals', needsValue: true },
  { value: 'ne', label: 'not equals', needsValue: true },
  { value: 'gt', label: 'greater than', needsValue: true },
  { value: 'ge', label: 'greater or equal', needsValue: true },
  { value: 'lt', label: 'less than', needsValue: true },
  { value: 'le', label: 'less or equal', needsValue: true },
  { value: 'contains', label: 'contains', needsValue: true },
  { value: 'not-contains', label: 'does not contain', needsValue: true },
  { value: 'startswith', label: 'starts with', needsValue: true },
  { value: 'endswith', label: 'ends with', needsValue: true },
  { value: 'null', label: 'is null', needsValue: false },
  { value: 'not-null', label: 'is not null', needsValue: false },
];

const TYPES: ValueType[] = ['string', 'number', 'boolean', 'guid', 'datetime'];

function literal(value: string, type: ValueType): string {
  switch (type) {
    case 'string':
      return `'${value.replace(/'/g, "''")}'`;
    case 'guid':
    case 'number':
    case 'boolean':
    case 'datetime':
      return value.trim();
  }
}

function renderCondition(row: Row): string | null {
  const field = row.field.trim();
  if (!field) return null;
  const def = OPERATORS.find((o) => o.value === row.op)!;
  if (def.needsValue && row.value.trim() === '' && row.type !== 'string') return null;
  const lit = literal(row.value, row.type);
  switch (row.op) {
    case 'null':
      return `${field} eq null`;
    case 'not-null':
      return `${field} ne null`;
    case 'contains':
      return `contains(${field},${lit})`;
    case 'not-contains':
      return `not contains(${field},${lit})`;
    case 'startswith':
      return `startswith(${field},${lit})`;
    case 'endswith':
      return `endswith(${field},${lit})`;
    default:
      return `${field} ${row.op} ${lit}`;
  }
}

let nextId = 100;

export default function ODataFilterBuilder() {
  const [rows, setRows] = useState<Row[]>([
    { id: 1, field: 'statecode', op: 'eq', value: '0', type: 'number' },
    { id: 2, field: 'name', op: 'contains', value: 'contoso', type: 'string' },
  ]);
  const [combine, setCombine] = useState<'and' | 'or'>('and');
  const [sweep, triggerSweep] = useSweep();
  const lastGood = useRef('');

  const filter = useMemo(() => {
    const parts = rows.map(renderCondition).filter((p): p is string => p !== null);
    return parts.join(` ${combine} `);
  }, [rows, combine]);

  useEffect(() => {
    if (filter && filter !== lastGood.current) {
      lastGood.current = filter;
      triggerSweep();
    }
  }, [filter, triggerSweep]);

  const update = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: number) => setRows((rs) => rs.filter((r) => r.id !== id));
  const add = () =>
    setRows((rs) => [...rs, { id: nextId++, field: '', op: 'eq', value: '', type: 'string' }]);

  const incomplete = rows.some((r) => renderCondition(r) === null);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="ui-label">COMBINE WITH:</span>
        <button type="button" className="btn" aria-pressed={combine === 'and'} onClick={() => setCombine('and')}>
          AND
        </button>
        <button type="button" className="btn" aria-pressed={combine === 'or'} onClick={() => setCombine('or')}>
          OR
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {rows.map((row) => {
          const def = OPERATORS.find((o) => o.value === row.op)!;
          return (
            <div key={row.id} className="flex flex-wrap items-center gap-2">
              <input
                className="field"
                style={{ width: 180, flex: '1 1 140px' }}
                placeholder="field (e.g. revenue)"
                aria-label="Field name"
                value={row.field}
                onChange={(e) => update(row.id, { field: e.target.value })}
                spellCheck={false}
              />
              <select
                className="field"
                style={{ width: 'auto' }}
                aria-label="Operator"
                value={row.op}
                onChange={(e) => update(row.id, { op: e.target.value as Operator })}
              >
                {OPERATORS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {def.needsValue && (
                <>
                  <input
                    className="field"
                    style={{ width: 160, flex: '1 1 120px' }}
                    placeholder="value"
                    aria-label="Value"
                    value={row.value}
                    onChange={(e) => update(row.id, { value: e.target.value })}
                    spellCheck={false}
                  />
                  <select
                    className="field"
                    style={{ width: 'auto' }}
                    aria-label="Value type"
                    value={row.type}
                    onChange={(e) => update(row.id, { type: e.target.value as ValueType })}
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <button type="button" className="btn" aria-label="Remove condition" onClick={() => remove(row.id)}>
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <button type="button" className="btn mt-3" onClick={add}>
        + ADD CONDITION
      </button>

      {incomplete && <ErrorLine>Rows with an empty field name (or missing non-string value) are skipped.</ErrorLine>}

      <OutputPane
        sweep={sweep}
        label="$FILTER"
        actions={
          <>
            <CopyButton text={() => `$filter=${filter}`} label="COPY $FILTER" />
            <CopyButton text={() => filter} label="COPY EXPRESSION" />
          </>
        }
      >
        <pre
          className="field"
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', minHeight: 72, margin: 0 }}
          aria-live="polite"
        >
          {filter ? `$filter=${filter}` : ''}
        </pre>
        {filter && (
          <p className="ui-label mt-3" style={{ wordBreak: 'break-all' }}>
            EXAMPLE:&ensp;
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>
              GET [org-uri]/api/data/v9.2/accounts?$select=name&$filter={encodeURIComponent(filter).replace(/%20/g, ' ')}
            </span>
          </p>
        )}
      </OutputPane>
    </div>
  );
}
