import { useEffect, useMemo, useRef, useState } from 'react';
import { CopyButton, ErrorLine, FieldLabel, OutputPane, useSweep } from './ui';

type Direction = 'encode' | 'decode';
type Mode = 'component' | 'uri';

const SAMPLE = 'order status: paid & shipped (50% off, café pickup)';

/** A string that contains %XX escapes and decodes to something different is almost certainly encoded. */
function looksEncoded(s: string): boolean {
  if (!/%[0-9a-fA-F]{2}/.test(s)) return false;
  try {
    return decodeURIComponent(s) !== s;
  } catch {
    return false;
  }
}

export default function UrlEncoderDecoder() {
  const [input, setInput] = useState(SAMPLE);
  const [direction, setDirection] = useState<Direction>('encode');
  const [mode, setMode] = useState<Mode>('component');
  const [plusAsSpace, setPlusAsSpace] = useState(false);
  const [sweep, triggerSweep] = useSweep();
  const lastGood = useRef('');

  const result = useMemo<{ ok: true; output: string } | { ok: false; error: string }>(() => {
    if (input === '') return { ok: true, output: '' };
    try {
      if (direction === 'encode') {
        return { ok: true, output: mode === 'component' ? encodeURIComponent(input) : encodeURI(input) };
      }
      const source = plusAsSpace ? input.replace(/\+/g, '%20') : input;
      return { ok: true, output: mode === 'component' ? decodeURIComponent(source) : decodeURI(source) };
    } catch (e) {
      return {
        ok: false,
        error: `${e instanceof Error ? e.message : String(e)} — usually a bare % that isn't followed by two hex digits.`,
      };
    }
  }, [input, direction, mode, plusAsSpace]);

  useEffect(() => {
    if (result.ok && result.output && result.output !== lastGood.current) {
      lastGood.current = result.output;
      triggerSweep();
    }
  }, [result, triggerSweep]);

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text');
    if (text) setDirection(looksEncoded(text) ? 'decode' : 'encode');
  };

  const swap = () => {
    if (result.ok && result.output) {
      setInput(result.output);
      setDirection((d) => (d === 'encode' ? 'decode' : 'encode'));
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="ui-label">DIRECTION:</span>
        <button type="button" className="btn" aria-pressed={direction === 'encode'} onClick={() => setDirection('encode')}>
          ENCODE
        </button>
        <button type="button" className="btn" aria-pressed={direction === 'decode'} onClick={() => setDirection('decode')}>
          DECODE
        </button>
        <button type="button" className="btn" onClick={swap} disabled={!result.ok || !result.output}>
          ⇄ USE OUTPUT AS INPUT
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label
          className="ui-label flex items-center gap-2"
          title="encodeURIComponent escapes every reserved character (use for values). encodeURI keeps :/?#&= intact (use for whole URLs)."
        >
          MODE
          <select className="field" style={{ width: 'auto' }} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="component">encodeURIComponent — single value</option>
            <option value="uri">encodeURI — whole URL</option>
          </select>
        </label>
        {direction === 'decode' && (
          <label className="ui-label flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={plusAsSpace}
              onChange={(e) => setPlusAsSpace(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }}
            />
            TREAT + AS SPACE (FORM ENCODING)
          </label>
        )}
      </div>
      <p className="ink-secondary mt-2" style={{ fontSize: 13, maxWidth: 640 }}>
        {mode === 'component'
          ? 'Component mode escapes every reserved character — right for a single query-string value or path segment.'
          : 'URL mode leaves :/?#&= untouched — right for encoding a complete URL without breaking its structure.'}
        {' '}Pasting auto-detects the likely direction.
      </p>

      <div className="mt-4">
        <FieldLabel htmlFor="url-input">{direction === 'encode' ? 'PLAIN TEXT IN' : 'ENCODED IN'}</FieldLabel>
        <textarea
          id="url-input"
          className="field"
          rows={5}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={onPaste}
          spellCheck={false}
        />
      </div>

      {!result.ok && <ErrorLine>{result.error}</ErrorLine>}

      <OutputPane
        sweep={sweep}
        label={direction === 'encode' ? 'ENCODED OUT' : 'DECODED OUT'}
        actions={<CopyButton text={() => (result.ok ? result.output : '')} />}
      >
        <pre
          className="field"
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', minHeight: 120, margin: 0 }}
          aria-live="polite"
        >
          {result.ok ? result.output : ''}
        </pre>
      </OutputPane>
    </div>
  );
}
