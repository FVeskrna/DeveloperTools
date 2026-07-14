import { useEffect, useMemo, useRef, useState } from 'react';
import { base64ToBytes, base64ToText, bytesToBase64, textToBase64 } from '../../lib/base64';
import { CopyButton, ErrorLine, FieldLabel, OutputPane, useSweep } from './ui';

type Direction = 'encode' | 'decode';

const SAMPLE = 'Ahoj! Déjà vu — čeština i emoji 🚀 fungují.';
const FILE_CAP_BYTES = 5 * 1024 * 1024;
const DISPLAY_CAP = 100_000;

interface FileResult {
  name: string;
  size: number;
  type: string;
  base64: string;
  dataUri: string;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function Base64EncoderDecoder() {
  const [direction, setDirection] = useState<Direction>('encode');
  const [input, setInput] = useState(SAMPLE);
  const [urlSafe, setUrlSafe] = useState(false);
  const [file, setFile] = useState<FileResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [sweep, triggerSweep] = useSweep();
  const lastGood = useRef('');

  const result = useMemo<{ ok: true; output: string } | { ok: false; error: string }>(() => {
    if (input === '') return { ok: true, output: '' };
    try {
      if (direction === 'encode') return { ok: true, output: textToBase64(input, urlSafe) };
      // Decoding a full data: URI — use only the payload after the comma.
      const m = input.trim().match(/^data:[^,]*;base64,(.*)$/s);
      return { ok: true, output: base64ToText(m ? m[1]! : input) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: /decode/i.test(msg) && !/alphabet|length/i.test(msg)
          ? 'Decoded bytes are not valid UTF-8 text — this looks like binary data (a file, not text).'
          : msg,
      };
    }
  }, [input, direction, urlSafe]);

  const imagePreview = useMemo(() => {
    if (direction !== 'decode') return null;
    const trimmed = input.trim();
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed)) {
      try {
        base64ToBytes(trimmed.slice(trimmed.indexOf(',') + 1));
        return trimmed;
      } catch {
        return null;
      }
    }
    return null;
  }, [input, direction]);

  useEffect(() => {
    if (result.ok && result.output && result.output !== lastGood.current) {
      lastGood.current = result.output;
      triggerSweep();
    }
  }, [result, triggerSweep]);

  const handleFile = (f: File | undefined) => {
    setFile(null);
    setFileError(null);
    if (!f) return;
    if (f.size > FILE_CAP_BYTES) {
      setFileError(
        `${f.name} is ${fmtBytes(f.size)} — over the ${fmtBytes(FILE_CAP_BYTES)} limit. Everything runs in this tab's memory, and Base64 output is ~33% larger than the file; use a command-line tool (certutil, base64) for big files.`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result as ArrayBuffer);
      const b64 = bytesToBase64(bytes);
      const type = f.type || 'application/octet-stream';
      setFile({
        name: f.name,
        size: f.size,
        type,
        base64: b64,
        dataUri: `data:${type};base64,${b64}`,
      });
      triggerSweep();
    };
    reader.onerror = () => setFileError('Could not read the file.');
    reader.readAsArrayBuffer(f);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="ui-label">DIRECTION:</span>
        <button type="button" className="btn" aria-pressed={direction === 'encode'} onClick={() => setDirection('encode')}>
          TEXT → BASE64
        </button>
        <button type="button" className="btn" aria-pressed={direction === 'decode'} onClick={() => setDirection('decode')}>
          BASE64 → TEXT
        </button>
        {direction === 'encode' && (
          <label className="ui-label ml-2 flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={urlSafe} onChange={(e) => setUrlSafe(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
            URL-SAFE (-_ INSTEAD OF +/, NO PADDING)
          </label>
        )}
      </div>

      <div className="mt-4">
        <FieldLabel htmlFor="b64-input">{direction === 'encode' ? 'TEXT IN' : 'BASE64 IN (DATA: URIS ACCEPTED)'}</FieldLabel>
        <textarea
          id="b64-input"
          className="field"
          rows={5}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
        />
      </div>

      {!result.ok && <ErrorLine>{result.error}</ErrorLine>}

      <OutputPane
        sweep={sweep}
        label={direction === 'encode' ? 'BASE64 OUT' : 'TEXT OUT'}
        actions={<CopyButton text={() => (result.ok ? result.output : '')} />}
      >
        {imagePreview ? (
          <div>
            <p className="ui-label mb-2">INPUT IS AN IMAGE DATA URI — PREVIEW:</p>
            <img
              src={imagePreview}
              alt="Decoded image preview"
              style={{ maxWidth: '100%', maxHeight: 240, border: '1px solid var(--hairline)' }}
            />
          </div>
        ) : (
          <pre
            className="field"
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', minHeight: 120, margin: 0 }}
            aria-live="polite"
          >
            {result.ok ? result.output : ''}
          </pre>
        )}
      </OutputPane>

      <div className="hairline-t mt-8 pt-5">
        <p className="ui-label mb-2">FILE → BASE64 (MAX {fmtBytes(FILE_CAP_BYTES)}, STAYS IN THIS TAB)</p>
        <label
          className="block cursor-pointer"
          style={{
            border: `1px dashed ${dragOver ? 'var(--accent)' : 'var(--hairline)'}`,
            padding: '20px 16px',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--ink-secondary)',
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFile(e.dataTransfer.files[0]);
          }}
        >
          Drop a file here, or click to choose one
          <input type="file" className="sr-only" onChange={(e) => handleFile(e.target.files?.[0])} />
        </label>

        {fileError && <ErrorLine>{fileError}</ErrorLine>}

        {file && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="ui-label">
                {file.name.toUpperCase()} · {fmtBytes(file.size)} · {file.type}
              </span>
              <span className="flex gap-2">
                <CopyButton text={() => file.base64} label="COPY BASE64" />
                <CopyButton text={() => file.dataUri} label="COPY DATA: URI" />
              </span>
            </div>
            {file.type.startsWith('image/') && (
              <img
                src={file.dataUri}
                alt={`Preview of ${file.name}`}
                style={{ maxWidth: '100%', maxHeight: 200, border: '1px solid var(--hairline)', marginTop: 10 }}
              />
            )}
            <pre
              className="field mt-3"
              style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto', margin: 0 }}
            >
              {file.base64.length > DISPLAY_CAP
                ? `${file.base64.slice(0, DISPLAY_CAP)}… (showing first ${DISPLAY_CAP.toLocaleString()} of ${file.base64.length.toLocaleString()} characters — COPY BASE64 copies everything)`
                : file.base64}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
