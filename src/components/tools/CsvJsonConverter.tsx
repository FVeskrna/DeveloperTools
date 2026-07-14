import { useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { CopyButton, ErrorLine, FieldLabel, OutputPane, useSweep } from './ui';

type Direction = 'csv-to-json' | 'json-to-csv';
type Delimiter = 'auto' | ',' | ';' | '\t';

const SAMPLE_CSV = `name;city;revenue;active
Jana Novak;Brno;125000;true
Petr Svoboda;Praha;98000;false
Eva Mala;Ostrava;143500;true`;

const DELIM_LABEL: Record<string, string> = { ',': 'comma', ';': 'semicolon', '\t': 'tab' };

/** One level of dot-notation flattening; deeper objects and arrays become JSON strings. */
function flattenRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const [ck, cv] of Object.entries(v as Record<string, unknown>)) {
        out[`${k}.${ck}`] = cv !== null && typeof cv === 'object' ? JSON.stringify(cv) : cv;
      }
    } else if (Array.isArray(v)) {
      out[k] = JSON.stringify(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

interface Converted {
  output: string;
  rows: Record<string, unknown>[];
  columns: string[];
  note: string;
}

export default function CsvJsonConverter() {
  const [direction, setDirection] = useState<Direction>('csv-to-json');
  const [input, setInput] = useState(SAMPLE_CSV);
  const [delimiter, setDelimiter] = useState<Delimiter>('auto');
  const [headerRow, setHeaderRow] = useState(true);
  const [inferTypes, setInferTypes] = useState(true);
  const [sweep, triggerSweep] = useSweep();
  const lastGood = useRef('');

  const result = useMemo<{ ok: true; value: Converted } | { ok: false; error: string }>(() => {
    if (!input.trim()) return { ok: false, error: 'Paste some data.' };
    try {
      if (direction === 'csv-to-json') {
        const parsed = Papa.parse(input.trim(), {
          delimiter: delimiter === 'auto' ? '' : delimiter,
          header: headerRow,
          dynamicTyping: inferTypes,
          skipEmptyLines: true,
        });
        const fatal = parsed.errors.find((e) => e.type === 'Delimiter' || e.type === 'Quotes');
        if (fatal) {
          return { ok: false, error: `${fatal.message}${fatal.row !== undefined ? ` (row ${fatal.row + 1})` : ''}` };
        }
        const data = parsed.data as unknown[];
        const rows: Record<string, unknown>[] = headerRow
          ? (data as Record<string, unknown>[])
          : (data as unknown[][]).map((arr) => Object.fromEntries(arr.map((v, i) => [`col${i + 1}`, v])));
        const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
        const used = parsed.meta.delimiter;
        return {
          ok: true,
          value: {
            output: JSON.stringify(headerRow ? rows : data, null, 2),
            rows,
            columns,
            note: `${rows.length} rows · ${columns.length} columns · delimiter: ${DELIM_LABEL[used] ?? JSON.stringify(used)}${delimiter === 'auto' ? ' (auto-detected)' : ''}`,
          },
        };
      }

      // JSON → CSV
      const json: unknown = JSON.parse(input);
      const arr = Array.isArray(json) ? json : [json];
      if (arr.length === 0) return { ok: false, error: 'The JSON array is empty.' };
      if (!arr.every((r) => r !== null && typeof r === 'object' && !Array.isArray(r))) {
        return { ok: false, error: 'Expected a JSON array of objects (or a single object).' };
      }
      const rows = (arr as Record<string, unknown>[]).map(flattenRow);
      const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      const outDelim = delimiter === 'auto' ? ',' : delimiter;
      const csv = Papa.unparse(
        { fields, data: rows.map((r) => fields.map((f) => (r[f] === undefined ? '' : r[f]))) },
        { delimiter: outDelim },
      );
      return {
        ok: true,
        value: {
          output: csv,
          rows,
          columns: fields,
          note: `${rows.length} rows · ${fields.length} columns · delimiter: ${DELIM_LABEL[outDelim]}`,
        },
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, [input, direction, delimiter, headerRow, inferTypes]);

  useEffect(() => {
    if (result.ok && result.value.output !== lastGood.current) {
      lastGood.current = result.value.output;
      triggerSweep();
    }
  }, [result, triggerSweep]);

  const swap = () => {
    if (result.ok) {
      setInput(result.value.output);
      setDirection((d) => (d === 'csv-to-json' ? 'json-to-csv' : 'csv-to-json'));
    }
  };

  const previewRows = result.ok ? result.value.rows.slice(0, 10) : [];
  const previewCols = result.ok ? result.value.columns.slice(0, 8) : [];
  const hiddenCols = result.ok ? result.value.columns.length - previewCols.length : 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="ui-label">DIRECTION:</span>
        <button type="button" className="btn" aria-pressed={direction === 'csv-to-json'} onClick={() => setDirection('csv-to-json')}>
          CSV → JSON
        </button>
        <button type="button" className="btn" aria-pressed={direction === 'json-to-csv'} onClick={() => setDirection('json-to-csv')}>
          JSON → CSV
        </button>
        <button type="button" className="btn" onClick={swap} disabled={!result.ok}>
          ⇄ USE OUTPUT AS INPUT
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="ui-label flex items-center gap-2">
          DELIMITER
          <select className="field" style={{ width: 'auto' }} value={delimiter} onChange={(e) => setDelimiter(e.target.value as Delimiter)}>
            <option value="auto">{direction === 'csv-to-json' ? 'auto-detect' : 'comma (default)'}</option>
            <option value=",">comma</option>
            <option value=";">semicolon</option>
            <option value={'\t'}>tab</option>
          </select>
        </label>
        {direction === 'csv-to-json' && (
          <>
            <label className="ui-label flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={headerRow} onChange={(e) => setHeaderRow(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
              FIRST ROW IS HEADER
            </label>
            <label className="ui-label flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={inferTypes} onChange={(e) => setInferTypes(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
              INFER TYPES (NUMBERS, BOOLEANS)
            </label>
          </>
        )}
      </div>

      <div className="mt-4">
        <FieldLabel htmlFor="cj-input">{direction === 'csv-to-json' ? 'CSV IN' : 'JSON IN (ARRAY OF OBJECTS)'}</FieldLabel>
        <textarea
          id="cj-input"
          className="field"
          rows={8}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
        />
      </div>

      {!result.ok && <ErrorLine>{result.error}</ErrorLine>}

      <OutputPane
        sweep={sweep}
        label={result.ok ? result.value.note.toUpperCase() : 'OUTPUT'}
        actions={<CopyButton text={() => (result.ok ? result.value.output : '')} />}
      >
        {result.ok && previewRows.length > 0 && (
          <div className="mb-4 overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  {previewCols.map((c) => (
                    <th key={c} className="ui-label hairline-b" style={{ textAlign: 'left', padding: '5px 10px', fontSize: 11 }}>
                      {c}
                    </th>
                  ))}
                  {hiddenCols > 0 && (
                    <th className="ui-label hairline-b" style={{ textAlign: 'left', padding: '5px 10px', fontSize: 11 }}>
                      +{hiddenCols} MORE
                    </th>
                  )}
                </tr>
              </thead>
              <tbody style={{ fontFamily: 'var(--font-mono)' }}>
                {previewRows.map((row, i) => (
                  <tr key={i}>
                    {previewCols.map((c) => (
                      <td key={c} className="hairline-b" style={{ padding: '5px 10px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row[c] === null || row[c] === undefined ? '' : String(row[c])}
                      </td>
                    ))}
                    {hiddenCols > 0 && <td className="hairline-b" style={{ padding: '5px 10px' }}>…</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {result.value.rows.length > 10 && (
              <p className="ui-label mt-1">PREVIEW OF FIRST 10 ROWS — OUTPUT BELOW IS COMPLETE</p>
            )}
          </div>
        )}
        <pre
          className="field"
          style={{ whiteSpace: 'pre', overflowX: 'auto', minHeight: 160, margin: 0 }}
          aria-live="polite"
        >
          {result.ok ? result.value.output : ''}
        </pre>
      </OutputPane>
    </div>
  );
}
