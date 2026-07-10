import { useEffect, useMemo, useRef, useState } from 'react';
import { CopyButton, ErrorLine, FieldLabel, OutputPane, useSweep } from './ui';

/* Base64url without atob/btoa so the pre-filled sample decodes during SSR too. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : undefined;
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 !== undefined) out += ALPHABET[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 !== undefined) out += ALPHABET[b2 & 63];
  }
  return out.replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecodeText(part: string): string {
  const s = part.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(s)) throw new Error('contains characters that are not base64url');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of s) {
    buffer = (buffer << 6) | ALPHABET.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

const SAMPLE_TOKEN = [
  b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
  b64urlEncode(
    JSON.stringify({
      sub: '24601',
      name: 'Jana Novak',
      iss: 'https://auth.example.com',
      aud: 'billing-api',
      iat: 1751790000,
      exp: 1909990800,
    }),
  ),
  'c2lnbmF0dXJlLW5vdC12ZXJpZmllZA',
].join('.');

const TIME_CLAIMS: Record<string, string> = {
  exp: 'Expires at',
  iat: 'Issued at',
  nbf: 'Not valid before',
};
const TEXT_CLAIMS: Record<string, string> = {
  iss: 'Issuer',
  sub: 'Subject',
  aud: 'Audience',
  jti: 'Token id',
};

interface Decoded {
  header: string;
  payload: string;
  signature: string;
  claims: Record<string, unknown>;
}

function decode(token: string): { ok: true; value: Decoded } | { ok: false; error: string } {
  const parts = token.trim().split('.');
  if (token.trim() === '') return { ok: false, error: 'Paste a JWT.' };
  if (parts.length !== 3) {
    return { ok: false, error: `A JWT has three dot-separated parts — found ${parts.length}.` };
  }
  const [h, p, s] = parts as [string, string, string];
  let headerObj: unknown;
  let payloadObj: unknown;
  try {
    headerObj = JSON.parse(b64urlDecodeText(h));
  } catch (e) {
    return { ok: false, error: `Header (part 1) is not valid base64url-encoded JSON: ${e instanceof Error ? e.message : e}` };
  }
  try {
    payloadObj = JSON.parse(b64urlDecodeText(p));
  } catch (e) {
    return { ok: false, error: `Payload (part 2) is not valid base64url-encoded JSON: ${e instanceof Error ? e.message : e}` };
  }
  return {
    ok: true,
    value: {
      header: JSON.stringify(headerObj, null, 2),
      payload: JSON.stringify(payloadObj, null, 2),
      signature: s,
      claims: typeof payloadObj === 'object' && payloadObj !== null ? (payloadObj as Record<string, unknown>) : {},
    },
  };
}

function ago(deltaMs: number): string {
  const abs = Math.abs(deltaMs) / 1000;
  const unit =
    abs < 120 ? [abs, 'seconds'] :
    abs < 7200 ? [abs / 60, 'minutes'] :
    abs < 172800 ? [abs / 3600, 'hours'] :
    abs < 63072000 ? [abs / 86400, 'days'] :
    [abs / 31536000, 'years'];
  const n = Math.round(unit[0] as number);
  return deltaMs < 0 ? `${n} ${unit[1]} ago` : `in ${n} ${unit[1]}`;
}

export default function JwtDecoder() {
  const [token, setToken] = useState(SAMPLE_TOKEN);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [sweep, triggerSweep] = useSweep();
  const lastGood = useRef('');

  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const result = useMemo(() => decode(token), [token]);

  useEffect(() => {
    if (result.ok && result.value.payload !== lastGood.current) {
      lastGood.current = result.value.payload;
      triggerSweep();
    }
  }, [result, triggerSweep]);

  const claims = result.ok ? result.value.claims : {};
  const exp = typeof claims.exp === 'number' ? claims.exp : null;
  const nbf = typeof claims.nbf === 'number' ? claims.nbf : null;

  let validity: { text: string; ok: boolean } | null = null;
  if (nowMs !== null && (exp !== null || nbf !== null)) {
    if (nbf !== null && nowMs < nbf * 1000) {
      validity = { text: `Not yet valid — becomes valid ${ago(nbf * 1000 - nowMs)}`, ok: false };
    } else if (exp !== null && nowMs >= exp * 1000) {
      validity = { text: `Expired ${ago(exp * 1000 - nowMs)}`, ok: false };
    } else if (exp !== null) {
      validity = { text: `In its valid window — expires ${ago(exp * 1000 - nowMs)}`, ok: true };
    }
  }

  const claimRows: { name: string; label: string; value: string; reads: string }[] = [];
  for (const [claim, label] of Object.entries(TIME_CLAIMS)) {
    const v = claims[claim];
    if (typeof v === 'number') {
      claimRows.push({
        name: claim,
        label,
        value: String(v),
        reads: `${new Date(v * 1000).toISOString()}${nowMs !== null ? ` · ${ago(v * 1000 - nowMs)}` : ''}`,
      });
    }
  }
  for (const [claim, label] of Object.entries(TEXT_CLAIMS)) {
    const v = claims[claim];
    if (v !== undefined) {
      claimRows.push({ name: claim, label, value: Array.isArray(v) ? v.join(', ') : String(v), reads: '' });
    }
  }

  return (
    <div>
      <FieldLabel htmlFor="jwt-input">JWT</FieldLabel>
      <textarea
        id="jwt-input"
        className="field"
        rows={4}
        style={{ wordBreak: 'break-all' }}
        value={token}
        onChange={(e) => setToken(e.target.value)}
        spellCheck={false}
      />
      <p role="note" className="mt-2" style={{ fontSize: 13, color: 'var(--ink-secondary)' }}>
        Decode only — the signature is <strong style={{ color: 'var(--error)' }}>not verified</strong>.
        Never use a decoder to decide whether a token can be trusted.
      </p>

      {!result.ok && <ErrorLine>{result.error}</ErrorLine>}

      <OutputPane
        sweep={sweep}
        label="DECODED"
        actions={result.ok ? <CopyButton text={() => result.value.payload} label="COPY PAYLOAD" /> : undefined}
      >
        {result.ok && (
          <div>
            {validity && (
              <p
                className={`ui-label mb-3 ${validity.ok ? 'status-ok' : 'status-error'}`}
                role="status"
              >
                {validity.ok ? '✓' : '✕'} {validity.text.toUpperCase()}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="ui-label mb-1.5">HEADER</p>
                <pre className="field" style={{ whiteSpace: 'pre-wrap', margin: 0, minHeight: 90 }}>
                  {result.value.header}
                </pre>
              </div>
              <div>
                <p className="ui-label mb-1.5">SIGNATURE (RAW, NOT CHECKED)</p>
                <pre className="field" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, minHeight: 90 }}>
                  {result.value.signature || '(empty — unsecured JWT)'}
                </pre>
              </div>
            </div>
            <p className="ui-label mt-4 mb-1.5">PAYLOAD</p>
            <pre className="field" style={{ whiteSpace: 'pre-wrap', margin: 0, minHeight: 140 }}>
              {result.value.payload}
            </pre>

            {claimRows.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['CLAIM', 'MEANING', 'VALUE', 'READS AS'].map((h) => (
                        <th key={h} className="ui-label hairline-b" style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11 }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody style={{ fontFamily: 'var(--font-mono)' }}>
                    {claimRows.map((r) => (
                      <tr key={r.name}>
                        <td className="hairline-b" style={{ padding: '6px 10px' }}>{r.name}</td>
                        <td className="hairline-b" style={{ padding: '6px 10px', fontFamily: 'var(--font-sans)' }}>{r.label}</td>
                        <td className="hairline-b tabular" style={{ padding: '6px 10px', wordBreak: 'break-all' }}>{r.value}</td>
                        <td className="hairline-b" style={{ padding: '6px 10px' }}>{r.reads}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </OutputPane>
    </div>
  );
}
