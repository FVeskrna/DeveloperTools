import { useEffect, useRef, useState } from 'react';
import { CopyButton, ErrorLine, OutputPane, useSweep } from './ui';

type Base = 2 | 8 | 10 | 16;

const BASES: { base: Base; label: string; prefix: string; pattern: RegExp }[] = [
  { base: 2, label: 'BINARY', prefix: '0b', pattern: /^[01]+$/ },
  { base: 8, label: 'OCTAL', prefix: '0o', pattern: /^[0-7]+$/ },
  { base: 10, label: 'DECIMAL', prefix: '', pattern: /^\d+$/ },
  { base: 16, label: 'HEX', prefix: '0x', pattern: /^[0-9a-fA-F]+$/ },
];

function parseInput(raw: string, base: Base): bigint | null {
  let s = raw.trim().replace(/[_\s]/g, '');
  if (!s) return null;
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  const def = BASES.find((b) => b.base === base)!;
  if (def.prefix && s.toLowerCase().startsWith(def.prefix)) s = s.slice(2);
  if (!def.pattern.test(s)) return null;
  try {
    const parsed = base === 10 ? BigInt(s) : BigInt(def.prefix + s);
    return negative ? -parsed : parsed;
  } catch {
    return null;
  }
}

function render(value: bigint, base: Base): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  return (neg ? '-' : '') + abs.toString(base);
}

const U64_MAX = (1n << 64n) - 1n;

export default function NumberBaseConverter() {
  const [values, setValues] = useState<Record<Base, string>>({
    2: '11111111',
    8: '377',
    10: '255',
    16: 'ff',
  });
  const [active, setActive] = useState<Base>(10);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<bigint | null>(255n);
  const [sweep, triggerSweep] = useSweep();
  const last = useRef<bigint | null>(255n);

  const onChange = (base: Base, raw: string) => {
    setActive(base);
    const parsed = parseInput(raw, base);
    if (raw.trim() === '') {
      setValues({ 2: '', 8: '', 10: '', 16: '' });
      setCurrent(null);
      setError(null);
      return;
    }
    if (parsed === null) {
      setValues((v) => ({ ...v, [base]: raw }));
      setCurrent(null);
      setError(`Not a valid base-${base} number.`);
      return;
    }
    setError(null);
    setCurrent(parsed);
    setValues({
      2: base === 2 ? raw : render(parsed, 2),
      8: base === 8 ? raw : render(parsed, 8),
      10: base === 10 ? raw : render(parsed, 10),
      16: base === 16 ? raw : render(parsed, 16),
    });
  };

  useEffect(() => {
    if (current !== null && current !== last.current) {
      last.current = current;
      triggerSweep();
    }
  }, [current, triggerSweep]);

  const showBits = current !== null && current >= 0n && current <= U64_MAX;
  const bitCount = !showBits ? 0 : current! <= 0xffn ? 8 : current! <= 0xffffn ? 16 : current! <= 0xffffffffn ? 32 : 64;
  const bits: number[] = [];
  if (showBits) {
    for (let i = bitCount - 1; i >= 0; i--) bits.push(Number((current! >> BigInt(i)) & 1n));
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        {BASES.map((b) => (
          <div key={b.base}>
            <label className="ui-label mb-1.5 flex items-baseline justify-between" htmlFor={`nb-${b.base}`}>
              <span>
                {b.label}
                {b.prefix && <span className="ink-secondary"> ({b.prefix})</span>}
              </span>
              {active === b.base && <span style={{ color: 'var(--accent)' }}>EDITING</span>}
            </label>
            <input
              id={`nb-${b.base}`}
              className="field tabular"
              value={values[b.base]}
              onChange={(e) => onChange(b.base, e.target.value)}
              spellCheck={false}
              autoComplete="off"
              inputMode={b.base === 10 ? 'numeric' : 'text'}
            />
          </div>
        ))}
      </div>

      {error && <ErrorLine>{error}</ErrorLine>}

      <OutputPane
        sweep={sweep}
        label={
          showBits
            ? `BIT LAYOUT · ${bitCount}-BIT · POPCOUNT ${bits.reduce((a, b) => a + b, 0)}`
            : 'BIT LAYOUT'
        }
        actions={current !== null ? <CopyButton text={() => render(current, 16)} label="COPY HEX" /> : undefined}
      >
        {showBits ? (
          <div>
            <div className="flex flex-wrap gap-x-3 gap-y-2" aria-label={`Binary representation, ${bitCount} bits`}>
              {Array.from({ length: bitCount / 8 }, (_, byte) => (
                <span key={byte} className="inline-flex" role="group" aria-label={`Byte ${bitCount / 8 - byte}`}>
                  {bits.slice(byte * 8, byte * 8 + 8).map((bit, i) => (
                    <span key={i} className={`bit ${bit ? 'on' : ''}`}>
                      {bit}
                    </span>
                  ))}
                </span>
              ))}
            </div>
            <p className="ui-label mt-2">
              MSB → LSB, GROUPED PER BYTE
            </p>
          </div>
        ) : (
          <p className="ink-secondary" style={{ fontSize: 13 }}>
            {current === null
              ? 'Enter a number in any pane.'
              : 'Bit view covers unsigned values up to 64 bits (0 … 18446744073709551615).'}
          </p>
        )}
      </OutputPane>
    </div>
  );
}
