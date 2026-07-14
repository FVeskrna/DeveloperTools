import { useEffect, useMemo, useState } from 'react';
import { CopyButton, ErrorLine, FieldLabel, OutputPane, useSweep } from './ui';

function uuidV4(): string {
  return crypto.randomUUID();
}

/** RFC 9562 UUIDv7: 48-bit unix-ms timestamp + random, so ids sort by creation time. */
function uuidV7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const ts = BigInt(Date.now());
  for (let i = 0; i < 6; i++) {
    bytes[i] = Number((ts >> BigInt(40 - i * 8)) & 0xffn);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function formatUuid(u: string, opts: { upper: boolean; braces: boolean; hyphens: boolean }): string {
  let s = opts.hyphens ? u : u.replace(/-/g, '');
  if (opts.upper) s = s.toUpperCase();
  if (opts.braces) s = `{${s}}`;
  return s;
}

interface Inspection {
  canonical: string;
  version: string;
  variant: string;
  timestamp?: string;
}

function inspect(input: string): { ok: true; value: Inspection } | { ok: false; error: string } {
  const cleaned = input.trim().replace(/^\{|\}$/g, '').replace(/^urn:uuid:/i, '');
  const hex = cleaned.replace(/-/g, '').toLowerCase();
  if (hex === '') return { ok: false, error: 'Paste a UUID to inspect.' };
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    return { ok: false, error: 'Not a UUID: expected 32 hex digits (hyphens, braces, and urn:uuid: prefix are allowed).' };
  }
  const canonical = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const versionDigit = hex[12]!;
  const variantNibble = parseInt(hex[16]!, 16);
  const variant =
    variantNibble < 8 ? 'NCS (reserved, pre-RFC)' :
    variantNibble < 12 ? 'RFC 4122/9562' :
    variantNibble < 14 ? 'Microsoft (reserved)' : 'Future (reserved)';
  const versionNames: Record<string, string> = {
    '1': 'v1 — time + MAC address',
    '2': 'v2 — DCE security',
    '3': 'v3 — MD5 name-based',
    '4': 'v4 — random',
    '5': 'v5 — SHA-1 name-based',
    '6': 'v6 — reordered time',
    '7': 'v7 — unix-time + random',
    '8': 'v8 — custom',
  };
  const result: Inspection = {
    canonical,
    version: versionNames[versionDigit] ?? `unknown (version digit "${versionDigit}")`,
    variant,
  };
  if (versionDigit === '7') {
    const ms = Number(BigInt('0x' + hex.slice(0, 12)));
    result.timestamp = `${new Date(ms).toISOString()} (embedded unix-ms timestamp)`;
  }
  return { ok: true, value: result };
}

export default function UuidGenerator() {
  const [version, setVersion] = useState<'v4' | 'v7'>('v4');
  const [count, setCount] = useState(5);
  const [upper, setUpper] = useState(false);
  const [braces, setBraces] = useState(false);
  const [hyphens, setHyphens] = useState(true);
  const [uuids, setUuids] = useState<string[]>([]);
  const [inspectInput, setInspectInput] = useState('9b2f5c1e-8d3a-4c7b-a1e0-5f4b3c2d1e0f');
  const [sweep, triggerSweep] = useSweep();

  const generate = (v: 'v4' | 'v7' = version, n: number = count) => {
    const clamped = Math.min(1000, Math.max(1, n));
    setUuids(Array.from({ length: clamped }, () => (v === 'v4' ? uuidV4() : uuidV7())));
    triggerSweep();
  };

  // crypto.randomUUID is browser-only; generate the initial batch after mount.
  useEffect(() => {
    generate('v4', 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatted = useMemo(
    () => uuids.map((u) => formatUuid(u, { upper, braces, hyphens })),
    [uuids, upper, braces, hyphens],
  );

  const inspection = useMemo(() => inspect(inspectInput), [inspectInput]);

  const check = (label: string, value: boolean, set: (v: boolean) => void) => (
    <label className="ui-label flex cursor-pointer items-center gap-1.5">
      <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
      {label}
    </label>
  );

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <FieldLabel htmlFor="uuid-version">VERSION</FieldLabel>
          <select
            id="uuid-version"
            className="field"
            value={version}
            onChange={(e) => {
              const v = e.target.value as 'v4' | 'v7';
              setVersion(v);
              generate(v);
            }}
          >
            <option value="v4">v4 — random</option>
            <option value="v7">v7 — time-ordered</option>
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="uuid-count">COUNT</FieldLabel>
          <input
            id="uuid-count"
            className="field tabular"
            style={{ width: 90 }}
            type="number"
            min={1}
            max={1000}
            value={count}
            onChange={(e) => setCount(Number(e.target.value) || 1)}
          />
        </div>
        <button type="button" className="btn btn-primary" style={{ marginBottom: 1 }} onClick={() => generate()}>
          GENERATE
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        {check('UPPERCASE', upper, setUpper)}
        {check('BRACES { }', braces, setBraces)}
        {check('HYPHENS', hyphens, setHyphens)}
      </div>

      <OutputPane
        sweep={sweep}
        label={`GENERATED: ${formatted.length}`}
        actions={<CopyButton text={() => formatted.join('\n')} label="COPY ALL" />}
      >
        <pre className="field tabular" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', minHeight: 130, margin: 0 }} aria-live="polite">
          {formatted.join('\n')}
        </pre>
      </OutputPane>

      <div className="hairline-t mt-8 pt-5">
        <FieldLabel htmlFor="uuid-inspect">VALIDATE / INSPECT A UUID</FieldLabel>
        <input
          id="uuid-inspect"
          className="field"
          value={inspectInput}
          onChange={(e) => setInspectInput(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        {!inspection.ok ? (
          <ErrorLine>{inspection.error}</ErrorLine>
        ) : (
          <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]" style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            <dt className="ui-label">CANONICAL</dt>
            <dd style={{ wordBreak: 'break-all' }}>{inspection.value.canonical}</dd>
            <dt className="ui-label">VERSION</dt>
            <dd>{inspection.value.version}</dd>
            <dt className="ui-label">VARIANT</dt>
            <dd>{inspection.value.variant}</dd>
            {inspection.value.timestamp && (
              <>
                <dt className="ui-label">TIMESTAMP</dt>
                <dd>{inspection.value.timestamp}</dd>
              </>
            )}
          </dl>
        )}
      </div>
    </div>
  );
}
