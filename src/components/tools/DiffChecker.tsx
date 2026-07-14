import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { diffLines, diffChars } from 'diff';
import { FieldLabel, OutputPane, useSweep } from './ui';

const SAMPLE_A = `{
  "name": "billing-api",
  "version": "2.4.0",
  "port": 8080,
  "logLevel": "info",
  "features": {
    "retries": true,
    "tracing": false
  }
}`;

const SAMPLE_B = `{
  "name": "billing-api",
  "version": "2.5.0",
  "port": 8443,
  "logLevel": "info",
  "timeoutMs": 4500,
  "features": {
    "retries": true,
    "tracing": true
  }
}`;

/** Cap on rendered rows so a 10k-line diff can't lock the tab. */
const RENDER_CAP = 5000;
/** Intra-line char diffing is skipped past these sizes — it stops being readable anyway. */
const CHAR_DIFF_MAX_LINE = 1000;
const CHAR_DIFF_MAX_BLOCK = 300;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

type Hunk =
  | { kind: 'ctx'; lines: string[] }
  | { kind: 'change'; del: string[]; add: string[] };

function buildHunks(a: string, b: string, ignoreCase: boolean, ignoreWhitespace: boolean): Hunk[] {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  // jsdiff's diffLines has no ignoreCase option: diff folded copies for the
  // structure, then map back to the original lines via each part's line count.
  const parts = diffLines(
    ignoreCase ? a.toLowerCase() : a,
    ignoreCase ? b.toLowerCase() : b,
    { ignoreWhitespace },
  );
  const hunks: Hunk[] = [];
  let pendingDel: string[] | null = null;
  let ai = 0;
  let bi = 0;
  for (const part of parts) {
    const count = part.count ?? part.value.split('\n').length - (part.value.endsWith('\n') ? 1 : 0);
    let lines: string[];
    if (part.removed) {
      lines = aLines.slice(ai, ai + count);
      ai += count;
    } else if (part.added) {
      lines = bLines.slice(bi, bi + count);
      bi += count;
    } else {
      lines = bLines.slice(bi, bi + count);
      ai += count;
      bi += count;
    }
    if (part.removed) {
      if (pendingDel) pendingDel.push(...lines);
      else pendingDel = [...lines];
    } else if (part.added) {
      hunks.push({ kind: 'change', del: pendingDel ?? [], add: lines });
      pendingDel = null;
    } else {
      if (pendingDel) {
        hunks.push({ kind: 'change', del: pendingDel, add: [] });
        pendingDel = null;
      }
      hunks.push({ kind: 'ctx', lines });
    }
  }
  if (pendingDel) hunks.push({ kind: 'change', del: pendingDel, add: [] });
  // A trailing newline produces a final empty context line — drop it.
  const last = hunks[hunks.length - 1];
  if (last && last.kind === 'ctx' && last.lines[last.lines.length - 1] === '') {
    last.lines.pop();
    if (last.lines.length === 0) hunks.pop();
  }
  return hunks;
}

/** Character-level highlight for one del/add line pair. */
function charSegments(del: string, add: string): { left: ReactNode; right: ReactNode } {
  if (del.length > CHAR_DIFF_MAX_LINE || add.length > CHAR_DIFF_MAX_LINE) {
    return { left: del, right: add };
  }
  const parts = diffChars(del, add);
  const left: ReactNode[] = [];
  const right: ReactNode[] = [];
  parts.forEach((p, i) => {
    if (p.removed) left.push(<mark key={i} className="diff-del-ch">{p.value}</mark>);
    else if (p.added) right.push(<mark key={i} className="diff-add-ch">{p.value}</mark>);
    else {
      left.push(p.value);
      right.push(p.value);
    }
  });
  return { left, right };
}

export default function DiffChecker() {
  const [a, setA] = useState(SAMPLE_A);
  const [b, setB] = useState(SAMPLE_B);
  const [view, setView] = useState<'unified' | 'side'>('unified');
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [sweep, triggerSweep] = useSweep();
  const lastKey = useRef('');

  const da = useDebounced(a, 300);
  const db = useDebounced(b, 300);

  const { hunks, stats } = useMemo(() => {
    const hunks = buildHunks(da, db, ignoreCase, ignoreWhitespace);
    let added = 0;
    let removed = 0;
    let changed = 0;
    for (const h of hunks) {
      if (h.kind === 'change') {
        const paired = Math.min(h.del.length, h.add.length);
        changed += paired;
        removed += h.del.length - paired;
        added += h.add.length - paired;
      }
    }
    return { hunks, stats: { added, removed, changed } };
  }, [da, db, ignoreCase, ignoreWhitespace]);

  useEffect(() => {
    const key = `${stats.added}|${stats.removed}|${stats.changed}|${da.length}|${db.length}`;
    if (key !== lastKey.current) {
      lastKey.current = key;
      triggerSweep();
    }
  }, [stats, da, db, triggerSweep]);

  const rows = useMemo(() => {
    const out: ReactNode[] = [];
    let count = 0;
    let ln = 0;
    let rn = 0;
    const push = (node: ReactNode) => {
      if (count < RENDER_CAP) out.push(node);
      count++;
    };

    for (let hi = 0; hi < hunks.length && count <= RENDER_CAP; hi++) {
      const h = hunks[hi]!;
      if (h.kind === 'ctx') {
        for (const line of h.lines) {
          ln++;
          rn++;
          push(
            view === 'unified' ? (
              <div key={count} className="diff-row flex">
                <span className="diff-gutter w-14 shrink-0 text-right pr-3">{ln}</span>
                <span className="w-5 shrink-0"> </span>
                <span className="min-w-0 flex-1">{line || ' '}</span>
              </div>
            ) : (
              <div key={count} className="diff-row grid grid-cols-2 gap-px">
                <span className="flex"><span className="diff-gutter w-10 shrink-0 text-right pr-2">{ln}</span><span className="min-w-0 flex-1">{line || ' '}</span></span>
                <span className="flex"><span className="diff-gutter w-10 shrink-0 text-right pr-2">{rn}</span><span className="min-w-0 flex-1">{line || ' '}</span></span>
              </div>
            ),
          );
        }
      } else {
        const pairs = Math.max(h.del.length, h.add.length);
        const doCharDiff = h.del.length <= CHAR_DIFF_MAX_BLOCK && h.add.length <= CHAR_DIFF_MAX_BLOCK;
        if (view === 'unified') {
          for (let i = 0; i < h.del.length; i++) {
            ln++;
            const paired = i < h.add.length && doCharDiff;
            const content = paired ? charSegments(h.del[i]!, h.add[i]!).left : h.del[i]!;
            push(
              <div key={count} className="diff-row diff-del flex">
                <span className="diff-gutter w-14 shrink-0 text-right pr-3">{ln}</span>
                <span className="w-5 shrink-0" style={{ color: 'var(--error)' }}>-</span>
                <span className="min-w-0 flex-1">{content || ' '}</span>
              </div>,
            );
          }
          for (let i = 0; i < h.add.length; i++) {
            rn++;
            const paired = i < h.del.length && doCharDiff;
            const content = paired ? charSegments(h.del[i]!, h.add[i]!).right : h.add[i]!;
            push(
              <div key={count} className="diff-row diff-add flex">
                <span className="diff-gutter w-14 shrink-0 text-right pr-3">{rn}</span>
                <span className="w-5 shrink-0" style={{ color: 'var(--ok)' }}>+</span>
                <span className="min-w-0 flex-1">{content || ' '}</span>
              </div>,
            );
          }
        } else {
          for (let i = 0; i < pairs; i++) {
            const delLine = i < h.del.length ? h.del[i]! : null;
            const addLine = i < h.add.length ? h.add[i]! : null;
            if (delLine !== null) ln++;
            if (addLine !== null) rn++;
            const seg =
              delLine !== null && addLine !== null && doCharDiff
                ? charSegments(delLine, addLine)
                : { left: delLine ?? '', right: addLine ?? '' };
            push(
              <div key={count} className="diff-row grid grid-cols-2 gap-px">
                <span className={`flex ${delLine !== null ? 'diff-del' : ''}`}>
                  <span className="diff-gutter w-10 shrink-0 text-right pr-2">{delLine !== null ? ln : ''}</span>
                  <span className="min-w-0 flex-1">{delLine !== null ? seg.left || ' ' : ''}</span>
                </span>
                <span className={`flex ${addLine !== null ? 'diff-add' : ''}`}>
                  <span className="diff-gutter w-10 shrink-0 text-right pr-2">{addLine !== null ? rn : ''}</span>
                  <span className="min-w-0 flex-1">{addLine !== null ? seg.right || ' ' : ''}</span>
                </span>
              </div>,
            );
          }
        }
      }
    }
    return { nodes: out, total: count };
  }, [hunks, view]);

  const check = (label: string, value: boolean, set: (v: boolean) => void) => (
    <label className="ui-label flex cursor-pointer items-center gap-1.5">
      <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
      {label}
    </label>
  );

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="diff-a">ORIGINAL</FieldLabel>
          <textarea id="diff-a" className="field" rows={9} value={a} onChange={(e) => setA(e.target.value)} spellCheck={false} />
        </div>
        <div>
          <FieldLabel htmlFor="diff-b">CHANGED</FieldLabel>
          <textarea id="diff-b" className="field" rows={9} value={b} onChange={(e) => setB(e.target.value)} spellCheck={false} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div className="flex gap-2">
          <button type="button" className="btn" aria-pressed={view === 'unified'} onClick={() => setView('unified')}>
            UNIFIED
          </button>
          <button type="button" className="btn" aria-pressed={view === 'side'} onClick={() => setView('side')}>
            SIDE BY SIDE
          </button>
        </div>
        {check('IGNORE CASE', ignoreCase, setIgnoreCase)}
        {check('IGNORE WHITESPACE', ignoreWhitespace, setIgnoreWhitespace)}
      </div>

      <OutputPane
        sweep={sweep}
        label={`DIFF: +${stats.added} ADDED · −${stats.removed} REMOVED · ${stats.changed} CHANGED`}
      >
        <div className="field" style={{ padding: '8px 0', overflowX: 'auto' }} aria-label="Diff result">
          {rows.nodes.length === 0 ? (
            <p className="ink-secondary px-3" style={{ fontSize: 13 }}>The two inputs are identical.</p>
          ) : (
            rows.nodes
          )}
        </div>
        {rows.total > RENDER_CAP && (
          <p className="ui-label mt-2">SHOWING FIRST {RENDER_CAP} OF {rows.total} LINES — COUNTS ABOVE COVER THE FULL DIFF</p>
        )}
      </OutputPane>
    </div>
  );
}
