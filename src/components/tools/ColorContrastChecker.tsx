import { useEffect, useMemo, useState } from 'react';
import { ErrorLine, FieldLabel, OutputPane, useSweep } from './ui';

type Rgb = { r: number; g: number; b: number };

function parseColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase();
  const hex = s.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  const rgb = s.match(/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/);
  if (rgb) {
    const [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    if (r > 255 || g > 255 || b > 255) return null;
    return { r, g, b };
  }
  return null;
}

const toHex = (c: Rgb) =>
  `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

function luminance(c: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

function rgbToHsl(c: Rgb): { h: number; s: number; l: number } {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: Math.round(hue(h + 1 / 3) * 255),
    g: Math.round(hue(h) * 255),
    b: Math.round(hue(h - 1 / 3) * 255),
  };
}

/** Nearest lightness adjustment of `fg` that reaches `target` against `bg`. */
function suggestShade(fg: Rgb, bg: Rgb, target: number): Rgb | null {
  const { h, s, l } = rgbToHsl(fg);
  let best: { rgb: Rgb; delta: number } | null = null;
  for (const dir of [-1, 1]) {
    for (let step = 1; step <= 100; step++) {
      const nl = l + (dir * step) / 100;
      if (nl < 0 || nl > 1) break;
      const candidate = hslToRgb(h, s, nl);
      if (contrastRatio(candidate, bg) >= target) {
        if (!best || step < best.delta) best = { rgb: candidate, delta: step };
        break;
      }
    }
  }
  return best?.rgb ?? null;
}

interface EyeDropperApi {
  open(): Promise<{ sRGBHex: string }>;
}

function Badge({ label, pass }: { label: string; pass: boolean }) {
  return (
    <span
      className={`ui-label ${pass ? 'status-ok' : 'status-error'}`}
      style={{ border: '1px solid currentColor', padding: '3px 8px', whiteSpace: 'nowrap' }}
      role="status"
    >
      {pass ? '✓' : '✕'} {label}
    </span>
  );
}

export default function ColorContrastChecker() {
  const [fgInput, setFgInput] = useState('#999999');
  const [bgInput, setBgInput] = useState('#ffffff');
  const [eyeDropper, setEyeDropper] = useState(false);
  const [sweep, triggerSweep] = useSweep();

  useEffect(() => {
    setEyeDropper('EyeDropper' in window);
  }, []);

  const fg = useMemo(() => parseColor(fgInput), [fgInput]);
  const bg = useMemo(() => parseColor(bgInput), [bgInput]);
  const ratio = fg && bg ? contrastRatio(fg, bg) : null;

  useEffect(() => {
    if (ratio !== null) triggerSweep();
  }, [ratio, triggerSweep]);

  const suggestion = useMemo(() => {
    if (!fg || !bg || ratio === null || ratio >= 4.5) return null;
    return suggestShade(fg, bg, 4.5);
  }, [fg, bg, ratio]);

  const pick = async (set: (v: string) => void) => {
    try {
      const picker = new (window as unknown as { EyeDropper: new () => EyeDropperApi }).EyeDropper();
      const { sRGBHex } = await picker.open();
      set(sRGBHex);
    } catch {
      /* user cancelled */
    }
  };

  const colorField = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    parsed: Rgb | null,
  ) => (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={parsed ? toHex(parsed) : '#000000'}
          onChange={(e) => set(e.target.value)}
          style={{ width: 36, height: 36, border: '1px solid var(--hairline)', background: 'var(--paper)', padding: 2, cursor: 'pointer' }}
        />
        <input
          id={id}
          className="field tabular"
          style={{ width: 160 }}
          value={value}
          onChange={(e) => set(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        {eyeDropper && (
          <button type="button" className="btn" onClick={() => pick(set)}>
            PICK FROM SCREEN
          </button>
        )}
      </div>
      {!parsed && <ErrorLine>Use hex (#1a2b3c) or rgb(26, 43, 60).</ErrorLine>}
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap gap-6">
        {colorField('cc-fg', 'TEXT COLOR', fgInput, setFgInput, fg)}
        {colorField('cc-bg', 'BACKGROUND COLOR', bgInput, setBgInput, bg)}
      </div>

      <OutputPane
        sweep={sweep}
        label={ratio !== null ? `CONTRAST RATIO: ${ratio.toFixed(2)} : 1` : 'CONTRAST RATIO'}
      >
        {fg && bg && ratio !== null && (
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge label="AA NORMAL (4.5)" pass={ratio >= 4.5} />
              <Badge label="AA LARGE (3.0)" pass={ratio >= 3} />
              <Badge label="AAA NORMAL (7.0)" pass={ratio >= 7} />
              <Badge label="AAA LARGE (4.5)" pass={ratio >= 4.5} />
            </div>

            <div
              className="mt-4"
              style={{ background: toHex(bg), color: toHex(fg), border: '1px solid var(--hairline)', padding: '18px 20px' }}
            >
              <p style={{ fontSize: 15, margin: 0 }}>
                Normal text (15px): The quick brown fox jumps over the lazy dog.
              </p>
              <p style={{ fontSize: 24, fontWeight: 500, margin: '10px 0 0' }}>
                Large text (24px): Grumpy wizards make toxic brew.
              </p>
            </div>

            {suggestion && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="ui-label">
                  NEAREST AA-PASSING SHADE: <span style={{ color: 'var(--ink)' }}>{toHex(suggestion)}</span>{' '}
                  ({contrastRatio(suggestion, bg).toFixed(2)} : 1)
                </span>
                <span
                  aria-hidden="true"
                  style={{ width: 22, height: 22, background: toHex(suggestion), border: '1px solid var(--hairline)', display: 'inline-block' }}
                />
                <button type="button" className="btn btn-primary" onClick={() => setFgInput(toHex(suggestion))}>
                  APPLY
                </button>
              </div>
            )}
          </div>
        )}
      </OutputPane>
    </div>
  );
}
