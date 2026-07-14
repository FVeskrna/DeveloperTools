/**
 * Base64 helpers that avoid atob/btoa so they work identically in the browser
 * and during SSR (pre-filled samples encode at build time), and handle
 * arbitrary bytes / UTF-8 correctly.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array, urlSafe = false): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : undefined;
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : ALPHABET[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : ALPHABET[b2 & 63];
  }
  if (urlSafe) return out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return out;
}

/** Accepts standard or URL-safe alphabet, with or without padding/whitespace. */
export function base64ToBytes(input: string): Uint8Array {
  const s = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(s)) {
    throw new Error('input contains characters outside the Base64 alphabet');
  }
  if (s.length % 4 === 1) {
    throw new Error('input length is invalid for Base64 (truncated?)');
  }
  const bytes = new Uint8Array(Math.floor((s.length * 6) / 8));
  let buffer = 0;
  let bits = 0;
  let n = 0;
  for (const ch of s) {
    buffer = (buffer << 6) | ALPHABET.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[n++] = (buffer >> bits) & 0xff;
    }
  }
  return bytes;
}

export function textToBase64(text: string, urlSafe = false): string {
  return bytesToBase64(new TextEncoder().encode(text), urlSafe);
}

export function base64ToText(b64: string): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(base64ToBytes(b64));
}
