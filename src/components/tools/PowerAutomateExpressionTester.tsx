import { useEffect, useMemo, useRef, useState } from 'react';
import { evaluateWdl, WdlError, type WdlContext, type WdlValue } from '../../lib/wdl';
import { CopyButton, ErrorLine, FieldLabel, OutputPane, useSweep } from './ui';

const SAMPLE_EXPR = "formatDateTime(utcNow(), 'yyyy-MM-dd')";

const SAMPLE_DATA = `{
  "variables": { "counter": 5 },
  "triggerBody": { "account": { "name": "Contoso", "revenue": 125000 } },
  "items": { "Apply_to_each": { "email": "jana@example.com" } },
  "outputs": { "Get_record": { "body": { "fullname": "Jana Novak" } } }
}`;

const PRESETS: { label: string; expr: string }[] = [
  { label: "TODAY'S DATE", expr: "formatDateTime(utcNow(), 'yyyy-MM-dd')" },
  { label: 'FIRST ARRAY ITEM', expr: 'first(createArray(1, 2, 3))' },
  { label: 'NULL-COALESCE TRIGGER FIELD', expr: "coalesce(triggerBody()?['account']?['fax'], 'not provided')" },
];

const REFERENCE: { category: string; items: { sig: string; note: string }[] }[] = [
  {
    category: 'String',
    items: [
      { sig: "concat('a', 'b', …)", note: 'join values into one string' },
      { sig: 'substring(text, start, length?)', note: '0-based start' },
      { sig: 'replace(text, old, new)', note: 'replaces every occurrence' },
      { sig: 'split(text, separator)', note: 'returns an array' },
      { sig: 'toLower(text) / toUpper(text)', note: '' },
      { sig: 'trim(text)', note: 'strips leading/trailing whitespace' },
      { sig: 'length(text | array)', note: '' },
      { sig: 'indexOf(text, search)', note: 'case-insensitive, −1 if absent' },
      { sig: 'slice(text, start, end?)', note: 'end is exclusive' },
      { sig: 'startsWith / endsWith(text, search)', note: 'case-insensitive' },
      { sig: 'guid()', note: 'random v4 GUID' },
    ],
  },
  {
    category: 'Collection',
    items: [
      { sig: 'first(coll) / last(coll)', note: 'string or array' },
      { sig: 'take(coll, n) / skip(coll, n)', note: '' },
      { sig: 'join(array, separator)', note: '' },
      { sig: 'contains(coll, item)', note: 'substring, array member, or object key' },
      { sig: 'empty(coll)', note: 'true for null, "", [], {}' },
      { sig: 'union(a, b, …) / intersection(a, b, …)', note: '' },
      { sig: 'createArray(a, b, …)', note: '' },
    ],
  },
  {
    category: 'Logical',
    items: [
      { sig: "if(condition, then, else)", note: 'only the winning branch evaluates' },
      { sig: 'equals(a, b)', note: 'deep comparison for arrays/objects' },
      { sig: 'and(…) / or(…) / not(x)', note: 'short-circuiting' },
      { sig: 'greater / less / greaterOrEquals / lessOrEquals(a, b)', note: '' },
      { sig: 'coalesce(a, b, …)', note: 'first non-null argument' },
    ],
  },
  {
    category: 'Math',
    items: [
      { sig: 'add / sub / mul / mod(a, b)', note: '' },
      { sig: 'div(a, b)', note: 'integer inputs divide as integers: div(10,4) → 2. Note: 10.0 reads as the integer 10 here' },
      { sig: 'min(…) / max(…)', note: 'values or a single array' },
      { sig: 'rand(min, max)', note: 'integer, max exclusive' },
      { sig: 'range(start, count)', note: '' },
    ],
  },
  {
    category: 'Date',
    items: [
      { sig: "utcNow(format?)", note: "default: yyyy-MM-ddTHH:mm:ss.fffffffZ" },
      { sig: 'addDays / addHours / addMinutes / addSeconds(ts, n, format?)', note: '' },
      { sig: 'formatDateTime(ts, format)', note: '.NET custom formats: yyyy MM dd HH mm ss ddd tt' },
      { sig: 'dayOfWeek(ts)', note: '0 = Sunday' },
      { sig: 'dayOfMonth(ts)', note: '' },
      { sig: 'startOfDay / startOfMonth(ts, format?)', note: '' },
      { sig: "convertTimeZone(ts, from, to, format?)", note: "Windows names ('Central Europe Standard Time') or IANA ids" },
      { sig: 'ticks(ts)', note: '.NET ticks as a string' },
      { sig: 'dateDifference(start, end)', note: 'timespan d.hh:mm:ss' },
    ],
  },
  {
    category: 'Conversion',
    items: [
      { sig: 'int(x) / float(x) / string(x) / bool(x)', note: '' },
      { sig: 'json(text)', note: 'parse a JSON string' },
      { sig: 'base64(text) / base64ToString(b64)', note: '' },
      { sig: 'uriComponent(text) / uriComponentToString(text)', note: '' },
    ],
  },
];

export default function PowerAutomateExpressionTester() {
  const [expr, setExpr] = useState(SAMPLE_EXPR);
  const [data, setData] = useState(SAMPLE_DATA);
  const [mounted, setMounted] = useState(false);
  const [sweep, triggerSweep] = useSweep();
  const exprRef = useRef<HTMLTextAreaElement>(null);
  const lastGood = useRef('');

  // utcNow()/guid() differ between build-time SSR and the client — evaluate
  // only after mount so hydration never mismatches.
  useEffect(() => setMounted(true), []);

  const ctx = useMemo<{ ok: true; value: WdlContext } | { ok: false; error: string }>(() => {
    try {
      const parsed: unknown = data.trim() === '' ? {} : JSON.parse(data);
      const obj = (parsed ?? {}) as Record<string, WdlValue>;
      return {
        ok: true,
        value: {
          variables: (obj.variables as Record<string, WdlValue>) ?? {},
          triggerBody: obj.triggerBody ?? null,
          items: (obj.items as Record<string, WdlValue>) ?? {},
          outputs: (obj.outputs as Record<string, WdlValue>) ?? {},
        },
      };
    } catch (e) {
      return { ok: false, error: `Sample data is not valid JSON: ${e instanceof Error ? e.message : e}` };
    }
  }, [data]);

  const result = useMemo<
    { ok: true; display: string; type: string } | { ok: false; error: string } | null
  >(() => {
    if (!mounted) return null;
    if (!ctx.ok) return { ok: false, error: ctx.error };
    try {
      const { value, type } = evaluateWdl(expr, ctx.value);
      return { ok: true, display: JSON.stringify(value, null, 2) ?? 'null', type };
    } catch (e) {
      if (e instanceof WdlError) return { ok: false, error: e.message };
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, [expr, ctx, mounted]);

  useEffect(() => {
    if (result?.ok && result.display !== lastGood.current) {
      lastGood.current = result.display;
      triggerSweep();
    }
  }, [result, triggerSweep]);

  const insert = (text: string) => {
    const el = exprRef.current;
    if (!el) return;
    const start = el.selectionStart ?? expr.length;
    const end = el.selectionEnd ?? expr.length;
    const next = expr.slice(0, start) + text + expr.slice(end);
    setExpr(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + text.length - 1; // inside the closing paren
      el.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <div>
      <FieldLabel htmlFor="wdl-expr">EXPRESSION</FieldLabel>
      <textarea
        id="wdl-expr"
        ref={exprRef}
        className="field"
        rows={3}
        value={expr}
        onChange={(e) => setExpr(e.target.value)}
        spellCheck={false}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="ui-label">PRESETS:</span>
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className="btn" onClick={() => setExpr(p.expr)}>
            {p.label}
          </button>
        ))}
      </div>

      {result && !result.ok && <ErrorLine>{result.error}</ErrorLine>}

      <OutputPane
        sweep={sweep}
        label={result?.ok ? `RESULT · TYPE: ${result.type.toUpperCase()}` : 'RESULT'}
        actions={result?.ok ? <CopyButton text={() => result.display} /> : undefined}
      >
        <pre
          className="field"
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', minHeight: 90, margin: 0 }}
          aria-live="polite"
        >
          {result?.ok ? result.display : ''}
        </pre>
      </OutputPane>

      <div className="mt-6">
        <FieldLabel htmlFor="wdl-data">
          SAMPLE DATA — FEEDS variables(), triggerBody(), items(), outputs()
        </FieldLabel>
        <textarea
          id="wdl-data"
          className="field"
          rows={7}
          value={data}
          onChange={(e) => setData(e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="hairline-t mt-8 pt-4">
        <p className="ui-label mb-2">FUNCTION REFERENCE — CLICK A NAME TO INSERT</p>
        {REFERENCE.map((group) => (
          <details key={group.category} className="notes" style={{ borderTop: 'none' }}>
            <summary>{group.category.toUpperCase()} — {group.items.length} FUNCTIONS</summary>
            <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, fontSize: 13 }}>
              {group.items.map((item) => {
                const name = item.sig.split('(')[0]!.split(' /')[0]!.trim();
                return (
                  <li key={item.sig} className="mb-1.5 flex flex-wrap items-baseline gap-x-3">
                    <button
                      type="button"
                      className="cursor-pointer"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', background: 'none', border: 'none', padding: 0, fontSize: 13 }}
                      onClick={() => insert(`${name}()`)}
                    >
                      {item.sig}
                    </button>
                    {item.note && <span className="ink-secondary">{item.note}</span>}
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </div>
    </div>
  );
}
