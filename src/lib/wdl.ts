/**
 * Safe evaluator for Power Automate / Logic Apps Workflow Definition Language
 * expressions. Hand-written tokenizer + recursive-descent parser + function
 * registry — no eval(), no Function(). Unknown functions fail with a friendly
 * message instead of crashing.
 */

export type WdlValue = string | number | boolean | null | WdlValue[] | { [k: string]: WdlValue };

export interface WdlContext {
  variables: Record<string, WdlValue>;
  triggerBody: WdlValue;
  items: Record<string, WdlValue>;
  outputs: Record<string, WdlValue>;
}

export class WdlError extends Error {}

/* ------------------------------------------------------------------ */
/* Tokenizer                                                           */
/* ------------------------------------------------------------------ */

interface Token {
  type: 'num' | 'str' | 'ident' | 'punct' | 'end';
  value: string;
  pos: number;
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "'") {
      let j = i + 1;
      let out = '';
      for (;;) {
        if (j >= src.length) throw new WdlError(`Unterminated string starting at position ${i}`);
        if (src[j] === "'") {
          if (src[j + 1] === "'") {
            out += "'";
            j += 2;
          } else {
            j++;
            break;
          }
        } else {
          out += src[j];
          j++;
        }
      }
      tokens.push({ type: 'str', value: out, pos: i });
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = src.slice(i).match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?/);
      tokens.push({ type: 'num', value: m![0], pos: i });
      i += m![0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      tokens.push({ type: 'ident', value: m![0], pos: i });
      i += m![0].length;
      continue;
    }
    if ('()[],.?'.includes(ch)) {
      tokens.push({ type: 'punct', value: ch, pos: i });
      i++;
      continue;
    }
    throw new WdlError(`Unexpected character '${ch}' at position ${i}`);
  }
  tokens.push({ type: 'end', value: '', pos: src.length });
  return tokens;
}

/* ------------------------------------------------------------------ */
/* Parser                                                              */
/* ------------------------------------------------------------------ */

type Node =
  | { kind: 'lit'; value: WdlValue }
  | { kind: 'call'; name: string; args: Node[] }
  | { kind: 'index'; target: Node; key: Node; safe: boolean };

class Parser {
  private i = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.i]!;
  }
  private next(): Token {
    return this.tokens[this.i++]!;
  }
  private expect(value: string): void {
    const t = this.next();
    if (t.type !== 'punct' || t.value !== value) {
      throw new WdlError(`Expected '${value}' at position ${t.pos}, found '${t.value || 'end of expression'}'`);
    }
  }

  parse(): Node {
    const node = this.expression();
    const t = this.peek();
    if (t.type !== 'end') throw new WdlError(`Unexpected '${t.value}' at position ${t.pos}`);
    return node;
  }

  private expression(): Node {
    let node = this.primary();
    for (;;) {
      const t = this.peek();
      if (t.type === 'punct' && t.value === '[') {
        this.next();
        const key = this.expression();
        this.expect(']');
        node = { kind: 'index', target: node, key, safe: false };
      } else if (t.type === 'punct' && t.value === '?') {
        this.next();
        this.expect('[');
        const key = this.expression();
        this.expect(']');
        node = { kind: 'index', target: node, key, safe: true };
      } else if (t.type === 'punct' && t.value === '.') {
        this.next();
        const name = this.next();
        if (name.type !== 'ident') throw new WdlError(`Expected a property name after '.' at position ${name.pos}`);
        node = { kind: 'index', target: node, key: { kind: 'lit', value: name.value }, safe: false };
      } else {
        return node;
      }
    }
  }

  private primary(): Node {
    const t = this.next();
    if (t.type === 'num') return { kind: 'lit', value: Number(t.value) };
    if (t.type === 'str') return { kind: 'lit', value: t.value };
    if (t.type === 'ident') {
      if (t.value === 'true') return { kind: 'lit', value: true };
      if (t.value === 'false') return { kind: 'lit', value: false };
      if (t.value === 'null') return { kind: 'lit', value: null };
      this.expect('(');
      const args: Node[] = [];
      if (!(this.peek().type === 'punct' && this.peek().value === ')')) {
        for (;;) {
          args.push(this.expression());
          const n = this.peek();
          if (n.type === 'punct' && n.value === ',') {
            this.next();
            continue;
          }
          break;
        }
      }
      this.expect(')');
      return { kind: 'call', name: t.value, args };
    }
    throw new WdlError(
      t.type === 'end'
        ? 'Unexpected end of expression'
        : `Unexpected '${t.value}' at position ${t.pos}`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const str = (v: WdlValue, fn: string): string => {
  if (typeof v === 'string') return v;
  throw new WdlError(`${fn}() expects a string, got ${typeName(v)}`);
};
const num = (v: WdlValue, fn: string): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  throw new WdlError(`${fn}() expects a number, got ${typeName(v)}`);
};
const arr = (v: WdlValue, fn: string): WdlValue[] => {
  if (Array.isArray(v)) return v;
  throw new WdlError(`${fn}() expects an array, got ${typeName(v)}`);
};
const jsonKey = (v: WdlValue) => JSON.stringify(v);

export function typeName(v: WdlValue): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'float';
  return typeof v;
}

function deepEquals(a: WdlValue, b: WdlValue): boolean {
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  return jsonKey(a) === jsonKey(b);
}

/* --- dates --------------------------------------------------------- */

function toDate(v: WdlValue, fn: string): Date {
  if (typeof v === 'string') {
    const ms = Date.parse(v);
    if (!Number.isNaN(ms)) return new Date(ms);
  }
  if (typeof v === 'number') return new Date(v);
  throw new WdlError(`${fn}(): '${String(v)}' is not a valid timestamp`);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const p2 = (n: number) => String(n).padStart(2, '0');

/** WDL default round-trip format: yyyy-MM-ddTHH:mm:ss.fffffffZ */
function isoUtc(d: Date): string {
  return d.toISOString().replace(/\.(\d{3})Z$/, '.$1' + '0000Z');
}

/** .NET-style custom date format, evaluated against UTC fields. */
function formatDate(d: Date, fmt: string): string {
  const y = d.getUTCFullYear();
  const M = d.getUTCMonth();
  const day = d.getUTCDate();
  const H = d.getUTCHours();
  const m = d.getUTCMinutes();
  const s = d.getUTCSeconds();
  const ms = d.getUTCMilliseconds();
  const h12 = H % 12 === 0 ? 12 : H % 12;
  const tokens: [string, () => string][] = [
    ['yyyy', () => String(y).padStart(4, '0')],
    ['yy', () => p2(y % 100)],
    ['MMMM', () => MONTHS[M]!],
    ['MMM', () => MONTHS[M]!.slice(0, 3)],
    ['MM', () => p2(M + 1)],
    ['M', () => String(M + 1)],
    ['dddd', () => DAYS[d.getUTCDay()]!],
    ['ddd', () => DAYS[d.getUTCDay()]!.slice(0, 3)],
    ['dd', () => p2(day)],
    ['d', () => String(day)],
    ['HH', () => p2(H)],
    ['H', () => String(H)],
    ['hh', () => p2(h12)],
    ['h', () => String(h12)],
    ['mm', () => p2(m)],
    ['m', () => String(m)],
    ['ss', () => p2(s)],
    ['s', () => String(s)],
    ['fff', () => String(ms).padStart(3, '0')],
    ['ff', () => String(Math.floor(ms / 10)).padStart(2, '0')],
    ['f', () => String(Math.floor(ms / 100))],
    ['tt', () => (H < 12 ? 'AM' : 'PM')],
    ['K', () => 'Z'],
  ];
  let out = '';
  let i = 0;
  while (i < fmt.length) {
    if (fmt[i] === "'") {
      const end = fmt.indexOf("'", i + 1);
      if (end === -1) throw new WdlError('Unterminated literal quote in format string');
      out += fmt.slice(i + 1, end);
      i = end + 1;
      continue;
    }
    if (fmt[i] === 'o' || fmt[i] === 'O') {
      out += isoUtc(d);
      i++;
      continue;
    }
    const tok = tokens.find(([t]) => fmt.startsWith(t, i));
    if (tok) {
      out += tok[1]();
      i += tok[0].length;
    } else {
      out += fmt[i];
      i++;
    }
  }
  return out;
}

/* --- time zones (curated Windows-name map, IANA accepted too) ------- */

const WINDOWS_TZ: Record<string, string> = {
  'utc': 'UTC',
  'gmt standard time': 'Europe/London',
  'w. europe standard time': 'Europe/Berlin',
  'central europe standard time': 'Europe/Prague',
  'romance standard time': 'Europe/Paris',
  'central european standard time': 'Europe/Warsaw',
  'fle standard time': 'Europe/Kyiv',
  'eastern standard time': 'America/New_York',
  'central standard time': 'America/Chicago',
  'mountain standard time': 'America/Denver',
  'pacific standard time': 'America/Los_Angeles',
  'e. south america standard time': 'America/Sao_Paulo',
  'tokyo standard time': 'Asia/Tokyo',
  'china standard time': 'Asia/Shanghai',
  'india standard time': 'Asia/Kolkata',
  'arabian standard time': 'Asia/Dubai',
  'singapore standard time': 'Asia/Singapore',
  'aus eastern standard time': 'Australia/Sydney',
};

export const SUPPORTED_TIMEZONES = Object.keys(WINDOWS_TZ);

function resolveTz(name: string): string {
  const mapped = WINDOWS_TZ[name.trim().toLowerCase()];
  if (mapped) return mapped;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return name; // valid IANA id
  } catch {
    throw new WdlError(
      `convertTimeZone(): unknown time zone '${name}'. Use an IANA id or one of: ${SUPPORTED_TIMEZONES.filter((z) => z !== 'utc').slice(0, 6).map((z) => `'${z}'`).join(', ')}, …`,
    );
  }
}

function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return wall - Math.floor(utcMs / 1000) * 1000;
}

/* ------------------------------------------------------------------ */
/* Function registry                                                   */
/* ------------------------------------------------------------------ */

type Evaluator = (node: Node) => WdlValue;
type FnImpl = (args: WdlValue[], ctx: WdlContext) => WdlValue;
type LazyFnImpl = (argNodes: Node[], evaluate: Evaluator) => WdlValue;

function checkArgs(name: string, args: unknown[], min: number, max: number = min): void {
  if (args.length < min || args.length > max) {
    throw new WdlError(
      `${name}() takes ${min === max ? min : `${min}-${max}`} argument${max === 1 ? '' : 's'}, got ${args.length}`,
    );
  }
}

const truthy = (v: WdlValue, fn: string): boolean => {
  if (typeof v === 'boolean') return v;
  throw new WdlError(`${fn}() expects a boolean, got ${typeName(v)}`);
};

const LAZY_FUNCTIONS: Record<string, LazyFnImpl> = {
  if: (nodes, ev) => {
    checkArgs('if', nodes, 3);
    return truthy(ev(nodes[0]!), 'if') ? ev(nodes[1]!) : ev(nodes[2]!);
  },
  and: (nodes, ev) => {
    checkArgs('and', nodes, 1, 99);
    for (const n of nodes) if (!truthy(ev(n), 'and')) return false;
    return true;
  },
  or: (nodes, ev) => {
    checkArgs('or', nodes, 1, 99);
    for (const n of nodes) if (truthy(ev(n), 'or')) return true;
    return false;
  },
  coalesce: (nodes, ev) => {
    for (const n of nodes) {
      const v = ev(n);
      if (v !== null) return v;
    }
    return null;
  },
};

function buildFunctions(ctx: WdlContext): Record<string, FnImpl> {
  return {
    /* context */
    variables: (a) => {
      checkArgs('variables', a, 1);
      const name = str(a[0]!, 'variables');
      if (!(name in ctx.variables)) throw new WdlError(`variables('${name}') — add "${name}" under "variables" in the sample data panel`);
      return ctx.variables[name]!;
    },
    triggerBody: (a) => {
      checkArgs('triggerBody', a, 0);
      if (ctx.triggerBody === null) throw new WdlError('triggerBody() — define "triggerBody" in the sample data panel');
      return ctx.triggerBody;
    },
    items: (a) => {
      checkArgs('items', a, 1);
      const name = str(a[0]!, 'items');
      if (!(name in ctx.items)) throw new WdlError(`items('${name}') — add "${name}" under "items" in the sample data panel`);
      return ctx.items[name]!;
    },
    outputs: (a) => {
      checkArgs('outputs', a, 1);
      const name = str(a[0]!, 'outputs');
      if (!(name in ctx.outputs)) throw new WdlError(`outputs('${name}') — add "${name}" under "outputs" in the sample data panel`);
      return ctx.outputs[name]!;
    },

    /* string */
    concat: (a) => a.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(''),
    substring: (a) => {
      checkArgs('substring', a, 2, 3);
      const s = str(a[0]!, 'substring');
      const start = num(a[1]!, 'substring');
      return a.length === 3 ? s.substring(start, start + num(a[2]!, 'substring')) : s.substring(start);
    },
    replace: (a) => {
      checkArgs('replace', a, 3);
      return str(a[0]!, 'replace').split(str(a[1]!, 'replace')).join(str(a[2]!, 'replace'));
    },
    split: (a) => {
      checkArgs('split', a, 2);
      return str(a[0]!, 'split').split(str(a[1]!, 'split'));
    },
    toLower: (a) => {
      checkArgs('toLower', a, 1);
      return str(a[0]!, 'toLower').toLowerCase();
    },
    toUpper: (a) => {
      checkArgs('toUpper', a, 1);
      return str(a[0]!, 'toUpper').toUpperCase();
    },
    trim: (a) => {
      checkArgs('trim', a, 1);
      return str(a[0]!, 'trim').trim();
    },
    length: (a) => {
      checkArgs('length', a, 1);
      const v = a[0]!;
      if (typeof v === 'string' || Array.isArray(v)) return v.length;
      throw new WdlError(`length() expects a string or array, got ${typeName(v)}`);
    },
    indexOf: (a) => {
      checkArgs('indexOf', a, 2);
      return str(a[0]!, 'indexOf').toLowerCase().indexOf(str(a[1]!, 'indexOf').toLowerCase());
    },
    slice: (a) => {
      checkArgs('slice', a, 2, 3);
      const s = str(a[0]!, 'slice');
      return a.length === 3 ? s.slice(num(a[1]!, 'slice'), num(a[2]!, 'slice')) : s.slice(num(a[1]!, 'slice'));
    },
    startsWith: (a) => {
      checkArgs('startsWith', a, 2);
      return str(a[0]!, 'startsWith').toLowerCase().startsWith(str(a[1]!, 'startsWith').toLowerCase());
    },
    endsWith: (a) => {
      checkArgs('endsWith', a, 2);
      return str(a[0]!, 'endsWith').toLowerCase().endsWith(str(a[1]!, 'endsWith').toLowerCase());
    },
    guid: (a) => {
      checkArgs('guid', a, 0);
      if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
      throw new WdlError('guid() needs a secure browser context');
    },

    /* collection */
    first: (a) => {
      checkArgs('first', a, 1);
      const v = a[0]!;
      if (typeof v === 'string') return v[0] ?? '';
      return arr(v, 'first')[0] ?? null;
    },
    last: (a) => {
      checkArgs('last', a, 1);
      const v = a[0]!;
      if (typeof v === 'string') return v[v.length - 1] ?? '';
      const x = arr(v, 'last');
      return x[x.length - 1] ?? null;
    },
    take: (a) => {
      checkArgs('take', a, 2);
      const v = a[0]!;
      const n = num(a[1]!, 'take');
      return typeof v === 'string' ? v.slice(0, n) : arr(v, 'take').slice(0, n);
    },
    skip: (a) => {
      checkArgs('skip', a, 2);
      return arr(a[0]!, 'skip').slice(num(a[1]!, 'skip'));
    },
    join: (a) => {
      checkArgs('join', a, 2);
      return arr(a[0]!, 'join').map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(str(a[1]!, 'join'));
    },
    contains: (a) => {
      checkArgs('contains', a, 2);
      const [c, item] = [a[0]!, a[1]!];
      if (typeof c === 'string') return c.includes(str(item, 'contains'));
      if (Array.isArray(c)) return c.some((v) => deepEquals(v, item));
      if (c !== null && typeof c === 'object') return str(item, 'contains') in c;
      throw new WdlError(`contains() expects a string, array, or object, got ${typeName(c)}`);
    },
    empty: (a) => {
      checkArgs('empty', a, 1);
      const v = a[0]!;
      if (v === null) return true;
      if (typeof v === 'string' || Array.isArray(v)) return v.length === 0;
      if (typeof v === 'object') return Object.keys(v).length === 0;
      return false;
    },
    union: (a) => {
      checkArgs('union', a, 2, 99);
      if (a.every((v) => Array.isArray(v))) {
        const seen = new Set<string>();
        const out: WdlValue[] = [];
        for (const v of a.flatMap((x) => x as WdlValue[])) {
          const k = jsonKey(v);
          if (!seen.has(k)) {
            seen.add(k);
            out.push(v);
          }
        }
        return out;
      }
      return Object.assign({}, ...a.map((v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {})));
    },
    intersection: (a) => {
      checkArgs('intersection', a, 2, 99);
      const arrays = a.map((v) => arr(v, 'intersection'));
      return arrays[0]!.filter((v) => arrays.every((x) => x.some((y) => deepEquals(y, v))));
    },
    createArray: (a) => [...a],

    /* logical (eager ones) */
    equals: (a) => {
      checkArgs('equals', a, 2);
      return deepEquals(a[0]!, a[1]!);
    },
    not: (a) => {
      checkArgs('not', a, 1);
      return !truthy(a[0]!, 'not');
    },
    greater: (a) => {
      checkArgs('greater', a, 2);
      return num(a[0]!, 'greater') > num(a[1]!, 'greater');
    },
    less: (a) => {
      checkArgs('less', a, 2);
      return num(a[0]!, 'less') < num(a[1]!, 'less');
    },
    greaterOrEquals: (a) => {
      checkArgs('greaterOrEquals', a, 2);
      return num(a[0]!, 'greaterOrEquals') >= num(a[1]!, 'greaterOrEquals');
    },
    lessOrEquals: (a) => {
      checkArgs('lessOrEquals', a, 2);
      return num(a[0]!, 'lessOrEquals') <= num(a[1]!, 'lessOrEquals');
    },

    /* math */
    add: (a) => {
      checkArgs('add', a, 2);
      return num(a[0]!, 'add') + num(a[1]!, 'add');
    },
    sub: (a) => {
      checkArgs('sub', a, 2);
      return num(a[0]!, 'sub') - num(a[1]!, 'sub');
    },
    mul: (a) => {
      checkArgs('mul', a, 2);
      return num(a[0]!, 'mul') * num(a[1]!, 'mul');
    },
    div: (a) => {
      checkArgs('div', a, 2);
      const d = num(a[1]!, 'div');
      if (d === 0) throw new WdlError('div(): division by zero');
      const x = num(a[0]!, 'div');
      // WDL: integer inputs divide as integers
      return Number.isInteger(x) && Number.isInteger(d) ? Math.trunc(x / d) : x / d;
    },
    mod: (a) => {
      checkArgs('mod', a, 2);
      return num(a[0]!, 'mod') % num(a[1]!, 'mod');
    },
    min: (a) => {
      checkArgs('min', a, 1, 99);
      const vals = a.length === 1 && Array.isArray(a[0]) ? (a[0] as WdlValue[]) : a;
      return Math.min(...vals.map((v) => num(v, 'min')));
    },
    max: (a) => {
      checkArgs('max', a, 1, 99);
      const vals = a.length === 1 && Array.isArray(a[0]) ? (a[0] as WdlValue[]) : a;
      return Math.max(...vals.map((v) => num(v, 'max')));
    },
    rand: (a) => {
      checkArgs('rand', a, 2);
      const lo = num(a[0]!, 'rand');
      const hi = num(a[1]!, 'rand');
      return lo + Math.floor(Math.random() * (hi - lo));
    },
    range: (a) => {
      checkArgs('range', a, 2);
      const start = num(a[0]!, 'range');
      const count = num(a[1]!, 'range');
      if (count < 0 || count > 100000) throw new WdlError('range(): count must be between 0 and 100000');
      return Array.from({ length: count }, (_, i) => start + i);
    },

    /* date */
    utcNow: (a) => {
      checkArgs('utcNow', a, 0, 1);
      const d = new Date();
      return a.length === 1 ? formatDate(d, str(a[0]!, 'utcNow')) : isoUtc(d);
    },
    addDays: (a) => addTime(a, 'addDays', 86400000),
    addHours: (a) => addTime(a, 'addHours', 3600000),
    addMinutes: (a) => addTime(a, 'addMinutes', 60000),
    addSeconds: (a) => addTime(a, 'addSeconds', 1000),
    formatDateTime: (a) => {
      checkArgs('formatDateTime', a, 1, 3);
      const d = toDate(a[0]!, 'formatDateTime');
      return a.length >= 2 ? formatDate(d, str(a[1]!, 'formatDateTime')) : isoUtc(d);
    },
    dayOfWeek: (a) => {
      checkArgs('dayOfWeek', a, 1);
      return toDate(a[0]!, 'dayOfWeek').getUTCDay();
    },
    dayOfMonth: (a) => {
      checkArgs('dayOfMonth', a, 1);
      return toDate(a[0]!, 'dayOfMonth').getUTCDate();
    },
    startOfDay: (a) => {
      checkArgs('startOfDay', a, 1, 2);
      const d = toDate(a[0]!, 'startOfDay');
      const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      return a.length === 2 ? formatDate(out, str(a[1]!, 'startOfDay')) : isoUtc(out);
    },
    startOfMonth: (a) => {
      checkArgs('startOfMonth', a, 1, 2);
      const d = toDate(a[0]!, 'startOfMonth');
      const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      return a.length === 2 ? formatDate(out, str(a[1]!, 'startOfMonth')) : isoUtc(out);
    },
    convertTimeZone: (a) => {
      checkArgs('convertTimeZone', a, 3, 4);
      const raw = str(a[0]!, 'convertTimeZone');
      const fromTz = resolveTz(str(a[1]!, 'convertTimeZone'));
      const toTz = resolveTz(str(a[2]!, 'convertTimeZone'));
      const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw.trim());
      let utcMs: number;
      if (hasOffset) {
        utcMs = Date.parse(raw);
      } else {
        // Interpret as wall time in the source zone (two-pass DST resolution).
        const wall = Date.parse(raw + 'Z');
        if (Number.isNaN(wall)) throw new WdlError(`convertTimeZone(): '${raw}' is not a valid timestamp`);
        utcMs = wall - tzOffsetMs(wall, fromTz);
        utcMs = wall - tzOffsetMs(utcMs, fromTz);
      }
      if (Number.isNaN(utcMs)) throw new WdlError(`convertTimeZone(): '${raw}' is not a valid timestamp`);
      const shifted = new Date(utcMs + tzOffsetMs(utcMs, toTz));
      return a.length === 4 ? formatDate(shifted, str(a[3]!, 'convertTimeZone')) : isoUtc(shifted).replace(/Z$/, '');
    },
    ticks: (a) => {
      checkArgs('ticks', a, 1);
      const ms = toDate(a[0]!, 'ticks').getTime();
      return (BigInt(ms) * 10000n + 621355968000000000n).toString();
    },
    dateDifference: (a) => {
      checkArgs('dateDifference', a, 2);
      const diff = toDate(a[1]!, 'dateDifference').getTime() - toDate(a[0]!, 'dateDifference').getTime();
      const sign = diff < 0 ? '-' : '';
      const abs = Math.abs(diff);
      const days = Math.floor(abs / 86400000);
      const h = Math.floor((abs % 86400000) / 3600000);
      const m = Math.floor((abs % 3600000) / 60000);
      const s = Math.floor((abs % 60000) / 1000);
      return `${sign}${days > 0 ? `${days}.` : ''}${p2(h)}:${p2(m)}:${p2(s)}`;
    },

    /* conversion */
    int: (a) => {
      checkArgs('int', a, 1);
      const n = num(a[0]!, 'int');
      if (!Number.isInteger(n)) throw new WdlError(`int(): '${String(a[0])}' is not an integer`);
      return n;
    },
    float: (a) => {
      checkArgs('float', a, 1);
      return num(a[0]!, 'float');
    },
    string: (a) => {
      checkArgs('string', a, 1);
      const v = a[0]!;
      return typeof v === 'string' ? v : JSON.stringify(v);
    },
    bool: (a) => {
      checkArgs('bool', a, 1);
      const v = a[0]!;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v !== 0;
      if (typeof v === 'string') {
        if (v.toLowerCase() === 'true') return true;
        if (v.toLowerCase() === 'false') return false;
      }
      throw new WdlError(`bool(): cannot convert ${typeName(v)} '${String(v)}'`);
    },
    json: (a) => {
      checkArgs('json', a, 1);
      try {
        return JSON.parse(str(a[0]!, 'json')) as WdlValue;
      } catch (e) {
        throw new WdlError(`json(): ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    base64: (a) => {
      checkArgs('base64', a, 1);
      const bytes = new TextEncoder().encode(str(a[0]!, 'base64'));
      let bin = '';
      bytes.forEach((b) => (bin += String.fromCharCode(b)));
      return typeof btoa !== 'undefined' ? btoa(bin) : Buffer.from(bytes).toString('base64');
    },
    base64ToString: (a) => {
      checkArgs('base64ToString', a, 1);
      const s = str(a[0]!, 'base64ToString');
      try {
        const bin = typeof atob !== 'undefined' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
        return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
      } catch {
        throw new WdlError(`base64ToString(): input is not valid Base64`);
      }
    },
    uriComponent: (a) => {
      checkArgs('uriComponent', a, 1);
      return encodeURIComponent(str(a[0]!, 'uriComponent'));
    },
    uriComponentToString: (a) => {
      checkArgs('uriComponentToString', a, 1);
      try {
        return decodeURIComponent(str(a[0]!, 'uriComponentToString'));
      } catch {
        throw new WdlError('uriComponentToString(): input is not valid percent-encoding');
      }
    },
  };
}

function addTime(a: WdlValue[], fn: string, unitMs: number): WdlValue {
  checkArgs(fn, a, 2, 3);
  const d = toDate(a[0]!, fn);
  const out = new Date(d.getTime() + num(a[1]!, fn) * unitMs);
  return a.length === 3 ? formatDate(out, str(a[2]!, fn)) : isoUtc(out);
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export function evaluateWdl(input: string, ctx: WdlContext): { value: WdlValue; type: string } {
  let src = input.trim();
  if (src === '') throw new WdlError('Enter an expression.');
  if (src.startsWith('@{') && src.endsWith('}')) src = src.slice(2, -1);
  else if (src.startsWith('@')) src = src.slice(1);

  const ast = new Parser(tokenize(src)).parse();
  const functions = buildFunctions(ctx);

  const evaluate: Evaluator = (node) => {
    if (node.kind === 'lit') return node.value;
    if (node.kind === 'index') {
      const target = evaluate(node.target);
      const key = evaluate(node.key);
      if (target === null) {
        if (node.safe) return null;
        throw new WdlError(`Cannot index into null — use ?[...] for null-safe access`);
      }
      if (Array.isArray(target)) {
        const i = num(key, 'index');
        if (i < 0 || i >= target.length) {
          if (node.safe) return null;
          throw new WdlError(`Index ${i} is out of range (array length ${target.length})`);
        }
        return target[i]!;
      }
      if (typeof target === 'object') {
        const k = String(key);
        if (!(k in target)) {
          if (node.safe) return null;
          throw new WdlError(`Property '${k}' not found — available: ${Object.keys(target).slice(0, 8).join(', ') || '(none)'}`);
        }
        return (target as Record<string, WdlValue>)[k]!;
      }
      throw new WdlError(`Cannot index into a ${typeName(target)}`);
    }
    const lazy = LAZY_FUNCTIONS[node.name];
    if (lazy) return lazy(node.args, evaluate);
    const fn = functions[node.name];
    if (!fn) throw new WdlError(`Function '${node.name}' is not supported in this tester`);
    return fn(node.args.map(evaluate), ctx);
  };

  const value = evaluate(ast);
  return { value, type: typeName(value) };
}
