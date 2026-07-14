import { useEffect, useMemo, useRef, useState } from 'react';
import { CopyButton, ErrorLine, FieldLabel, OutputPane, useSweep } from './ui';

const SAMPLE = `[Contoso.Plugins: Contoso.Plugins.AccountPreUpdate]

Entered Contoso.Plugins.AccountPreUpdate.Execute()
Depth: 2
Stage: 20
Mode: 0
MessageName: Update
PrimaryEntityName: account
CorrelationId: 8f4e2a1b-7c3d-4e5f-9a0b-1c2d3e4f5a6b
[09:14:02.120] Validating target entity
[09:14:02.128] Target contains 4 attributes
[09:14:02.371] Retrieving parent account
[09:14:03.045] Parent retrieved, checking credit limit
[09:14:03.052] Credit limit check failed, throwing

Unhandled Exception: System.ServiceModel.FaultException\`1[Microsoft.Xrm.Sdk.OrganizationServiceFault]: Account credit limit exceeded ---> System.InvalidOperationException: Credit limit 50000 is below requested 125000
   at Contoso.Plugins.AccountPreUpdate.CheckCredit(IOrganizationService svc)
   at Contoso.Plugins.AccountPreUpdate.Execute(IServiceProvider serviceProvider)`;

const STAGE_NOTES: Record<string, string> = {
  '10': 'Pre-validation (outside transaction)',
  '20': 'Pre-operation (inside transaction, before save)',
  '30': 'Main operation (platform internal)',
  '40': 'Post-operation (inside transaction, after save)',
};
const MODE_NOTES: Record<string, string> = { '0': 'Synchronous', '1': 'Asynchronous' };

const FIELD_DEFS: { key: RegExp; label: string; note?: (v: string) => string | null }[] = [
  { key: /^depth$/i, label: 'Depth', note: (v) => (Number(v) > 1 ? 'greater than 1 — this run was triggered by another plugin or workflow, not directly by the user' : 'direct call') },
  { key: /^stage$/i, label: 'Stage', note: (v) => STAGE_NOTES[v] ?? null },
  { key: /^(mode|isolationmode)$/i, label: 'Mode', note: (v) => MODE_NOTES[v] ?? null },
  { key: /^(messagename|message name|message)$/i, label: 'Message' },
  { key: /^(primaryentityname|primary entity)$/i, label: 'Primary entity' },
  { key: /^(secondaryentityname|secondary entity)$/i, label: 'Secondary entity' },
  { key: /^(correlationid|correlation id)$/i, label: 'Correlation id' },
  { key: /^(requestid|request id)$/i, label: 'Request id' },
  { key: /^(userid|user id|initiating user|initiatinguserid)$/i, label: 'User' },
  { key: /^(operationtype|operation type)$/i, label: 'Operation type' },
  { key: /^(duration|performanceexecutionduration|execution duration)$/i, label: 'Reported duration' },
];

const TS_RE = /^\s*\[?((?:\d{4}-\d{2}-\d{2}[T ])?\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,7})?Z?)\]?\s*[-–:]?\s*(.*)$/;
const EXC_START_RE = /(unhandled exception\s*:|exception details|^\s*exception\s*:|[\w.`\][]+(?:Exception|Fault)(?:`\d+\[[^\]]*\])?\s*:)/i;

interface Field { label: string; value: string; note: string | null }
interface TimelineEntry { time: string; deltaMs: number | null; text: string }
interface ExcSegment { type: string; message: string }

interface ParsedLog {
  fields: Field[];
  timeline: TimelineEntry[];
  steps: string[];
  exception: { segments: ExcSegment[]; raw: string } | null;
  totalMs: number | null;
}

function msOfTime(t: string): number | null {
  const iso = t.replace(',', '.').trim();
  if (/^\d{4}-/.test(iso)) {
    const parsed = Date.parse(iso.replace(' ', 'T') + (iso.endsWith('Z') ? '' : 'Z'));
    return Number.isNaN(parsed) ? null : parsed;
  }
  const m = iso.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?/);
  if (!m) return null;
  const frac = m[4] ? Number(`0.${m[4]}`) * 1000 : 0;
  return ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + frac;
}

export function parseTraceLog(text: string): ParsedLog {
  const lines = text.split(/\r?\n/);

  // Exception block: from the first exception-looking line to the end.
  let excStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (EXC_START_RE.test(lines[i]!)) {
      excStart = i;
      break;
    }
  }
  const bodyLines = excStart === -1 ? lines : lines.slice(0, excStart);
  const excRaw = excStart === -1 ? '' : lines.slice(excStart).join('\n').trim();

  let exception: ParsedLog['exception'] = null;
  if (excRaw) {
    const withoutStacks = excRaw
      .split('\n')
      .filter((l) => !/^\s+at\s/.test(l))
      .join('\n');
    const chain = withoutStacks
      .split(/\s*--->\s*|\n\s*Inner Exception\s*:?\s*/i)
      .map((s) => s.trim())
      .filter(Boolean);
    const segments: ExcSegment[] = [];
    for (const seg of chain) {
      const m = seg.match(/([\w.`\][]+(?:Exception|Fault)(?:`\d+\[[^\]]*\])?)\s*:\s*([\s\S]+)/);
      if (m) {
        segments.push({ type: m[1]!, message: m[2]!.split('\n')[0]!.trim() });
      } else if (segments.length === 0) {
        segments.push({ type: 'Exception', message: seg.split('\n')[0]!.trim() });
      }
    }
    exception = { segments, raw: excRaw };
  }

  const fields: Field[] = [];
  const timelineRaw: { abs: number | null; time: string; text: string }[] = [];
  const stepLines: string[] = [];

  for (const line of bodyLines) {
    if (!line.trim()) {
      stepLines.push('');
      continue;
    }
    const kv = line.match(/^\s*([A-Za-z ]+?)\s*[:=]\s*(.+)$/);
    if (kv) {
      const def = FIELD_DEFS.find((d) => d.key.test(kv[1]!.trim()));
      if (def) {
        const value = kv[2]!.trim();
        fields.push({ label: def.label, value, note: def.note ? def.note(value) : null });
        continue;
      }
    }
    const ts = line.match(TS_RE);
    if (ts && msOfTime(ts[1]!) !== null && ts[2]) {
      timelineRaw.push({ abs: msOfTime(ts[1]!), time: ts[1]!, text: ts[2]!.trim() });
      continue;
    }
    stepLines.push(line.trim());
  }

  const timeline: TimelineEntry[] = timelineRaw.map((e, i) => {
    const prev = i > 0 ? timelineRaw[i - 1]!.abs : null;
    const delta = e.abs !== null && prev !== null ? e.abs - prev : null;
    return { time: e.time, deltaMs: delta !== null && delta >= 0 ? delta : null, text: e.text };
  });
  const first = timelineRaw.find((e) => e.abs !== null)?.abs ?? null;
  const last = [...timelineRaw].reverse().find((e) => e.abs !== null)?.abs ?? null;
  const totalMs = first !== null && last !== null && last >= first ? last - first : null;

  const steps = stepLines
    .join('\n')
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);

  return { fields, timeline, steps, exception, totalMs };
}

export function toMarkdown(p: ParsedLog): string {
  const md: string[] = ['## Plugin trace summary', ''];
  if (p.exception && p.exception.segments.length > 0) {
    const inner = p.exception.segments[p.exception.segments.length - 1]!;
    md.push(`**Innermost exception:** \`${inner.type}\` — ${inner.message}`, '');
  }
  if (p.fields.length > 0) {
    md.push('| Field | Value |', '| --- | --- |');
    for (const f of p.fields) md.push(`| ${f.label} | ${f.value}${f.note ? ` (${f.note})` : ''} |`);
    md.push('');
  }
  if (p.timeline.length > 0) {
    md.push(`### Timeline${p.totalMs !== null ? ` (${p.totalMs} ms total)` : ''}`, '', '| Time | +ms | Message |', '| --- | ---: | --- |');
    for (const t of p.timeline) md.push(`| ${t.time} | ${t.deltaMs ?? ''} | ${t.text.replace(/\|/g, '\\|')} |`);
    md.push('');
  }
  if (p.steps.length > 0) {
    md.push('### Trace messages', '');
    for (const s of p.steps) md.push(`- ${s.replace(/\n/g, ' / ')}`);
    md.push('');
  }
  if (p.exception) {
    md.push('### Full exception', '', '```', p.exception.raw, '```');
  }
  return md.join('\n');
}

export default function PluginTraceLogParser() {
  const [input, setInput] = useState(SAMPLE);
  const [sweep, triggerSweep] = useSweep();
  const lastKey = useRef('');

  const parsed = useMemo(() => parseTraceLog(input), [input]);
  const empty =
    parsed.fields.length === 0 && parsed.timeline.length === 0 && parsed.steps.length === 0 && !parsed.exception;

  useEffect(() => {
    const key = `${parsed.fields.length}|${parsed.timeline.length}|${parsed.steps.length}|${parsed.exception?.raw.length ?? 0}`;
    if (!empty && key !== lastKey.current) {
      lastKey.current = key;
      triggerSweep();
    }
  }, [parsed, empty, triggerSweep]);

  const innermost =
    parsed.exception && parsed.exception.segments.length > 0
      ? parsed.exception.segments[parsed.exception.segments.length - 1]!
      : null;

  return (
    <div>
      <FieldLabel htmlFor="ptl-input">TRACE LOG TEXT (MESSAGE BLOCK + EXCEPTION DETAILS)</FieldLabel>
      <textarea
        id="ptl-input"
        className="field"
        rows={10}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        spellCheck={false}
      />

      {empty && input.trim() !== '' && (
        <ErrorLine>Nothing recognizable found — paste the Message Block and Exception Details text from a Plugin Trace Log record.</ErrorLine>
      )}

      <OutputPane
        sweep={sweep}
        label={`PARSED${parsed.totalMs !== null ? ` · TRACED SPAN ${parsed.totalMs} MS` : ''}`}
        actions={<CopyButton text={() => toMarkdown(parsed)} label="COPY AS MARKDOWN" />}
      >
        {innermost && (
          <div className="mb-4" style={{ border: '1px solid var(--error)', padding: '10px 12px' }} role="alert">
            <p className="ui-label status-error mb-1">INNERMOST EXCEPTION</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, wordBreak: 'break-word' }}>
              <strong>{innermost.type}</strong>: {innermost.message}
            </p>
            {parsed.exception!.segments.length > 1 && (
              <p className="ink-secondary mt-1" style={{ fontSize: 12 }}>
                Wrapped by:{' '}
                {parsed.exception!.segments
                  .slice(0, -1)
                  .map((s) => s.type)
                  .join(' → ')}
              </p>
            )}
          </div>
        )}

        {parsed.fields.length > 0 && (
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]" style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            {parsed.fields.map((f, i) => (
              <div key={i} className="contents">
                <dt className="ui-label">{f.label.toUpperCase()}</dt>
                <dd style={{ wordBreak: 'break-all' }}>
                  {f.value}
                  {f.note && <span className="ink-secondary" style={{ fontFamily: 'var(--font-sans)' }}> — {f.note}</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {parsed.timeline.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <p className="ui-label mb-1.5">EXECUTION TIMELINE</p>
            <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['TIME', '+MS', 'MESSAGE'].map((h) => (
                    <th key={h} className="ui-label hairline-b" style={{ textAlign: h === '+MS' ? 'right' : 'left', padding: '5px 10px', fontSize: 11 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ fontFamily: 'var(--font-mono)' }}>
                {parsed.timeline.map((t, i) => (
                  <tr key={i}>
                    <td className="hairline-b tabular" style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}>{t.time}</td>
                    <td
                      className="hairline-b tabular"
                      style={{
                        padding: '5px 10px',
                        textAlign: 'right',
                        color: t.deltaMs !== null && t.deltaMs > 500 ? 'var(--error)' : undefined,
                      }}
                    >
                      {t.deltaMs !== null ? `+${t.deltaMs}` : ''}
                    </td>
                    <td className="hairline-b" style={{ padding: '5px 10px' }}>{t.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="ui-label mt-1">GAPS OVER 500 MS ARE MARKED RED — THAT'S WHERE THE TIME WENT</p>
          </div>
        )}

        {parsed.steps.length > 0 && (
          <div className="mt-5">
            <p className="ui-label mb-1.5">TRACE MESSAGES</p>
            <ol style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.7, listStyle: 'decimal', marginLeft: '1.6em' }}>
              {parsed.steps.map((s, i) => (
                <li key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{s}</li>
              ))}
            </ol>
          </div>
        )}

        {parsed.exception && (
          <div className="mt-5">
            <p className="ui-label mb-1.5">FULL EXCEPTION (AS PASTED)</p>
            <pre className="field" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, maxHeight: 260, overflow: 'auto' }}>
              {parsed.exception.raw}
            </pre>
          </div>
        )}
      </OutputPane>
    </div>
  );
}
