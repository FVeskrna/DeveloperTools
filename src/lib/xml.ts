/**
 * Browser-only XML parsing + pretty-printing shared by the XML Formatter and
 * FetchXML Formatter. Uses DOMParser, so it must only be called client-side
 * (from event handlers or effects), never during SSR.
 */

export type XmlFormatResult =
  | { ok: true; output: string }
  | { ok: false; error: string; line?: number };

export interface XmlFormatOptions {
  /** Indentation unit for pretty output. Default: two spaces. */
  indent?: string;
  /** Collapse everything to a single line instead of pretty-printing. */
  minify?: boolean;
  /** Put each attribute on its own line, aligned under the first attribute. */
  alignAttributes?: boolean;
}

export function parseXml(source: string): { doc: Document } | { error: string; line?: number } {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  const errEl = doc.getElementsByTagName('parsererror')[0];
  if (errEl) {
    const raw = (errEl.textContent ?? 'XML parse error').replace(/\s+/g, ' ').trim();
    const lineMatch = raw.match(/line[:\s]+(\d+)/i);
    return { error: raw, line: lineMatch ? Number(lineMatch[1]) : undefined };
  }
  return { doc };
}

export function formatXml(source: string, options: XmlFormatOptions = {}): XmlFormatResult {
  if (!source.trim()) return { ok: false, error: 'Input is empty.' };
  const parsed = parseXml(source);
  if ('error' in parsed) return { ok: false, error: parsed.error, line: parsed.line };

  const indent = options.indent ?? '  ';
  const align = options.alignAttributes ?? false;
  // The DOM drops the XML declaration; recover it from the source text.
  const decl = source.match(/^\s*(<\?xml[^>]*\?>)/)?.[1];

  const body = Array.from(parsed.doc.childNodes)
    .map((n) => (options.minify ? serializeMin(n) : serializePretty(n, 0, indent, align)))
    .filter((s) => s.length > 0);

  const output = options.minify
    ? (decl ?? '') + body.join('')
    : [...(decl ? [decl] : []), ...body].join('\n');
  return { ok: true, output };
}

const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => escText(s).replace(/"/g, '&quot;');

function openTag(el: Element, pad: string, align: boolean, selfClose: boolean): string {
  const attrs = Array.from(el.attributes);
  const name = el.tagName;
  const tail = selfClose ? ' />' : '>';
  if (attrs.length === 0) return `${pad}<${name}${selfClose ? ' />' : '>'}`;
  const parts = attrs.map((a) => `${a.name}="${escAttr(a.value)}"`);
  if (!align || attrs.length === 1) return `${pad}<${name} ${parts.join(' ')}${tail}`;
  // Aligned: first attribute on the tag line, the rest lined up beneath it.
  const alignPad = ' '.repeat(pad.length + 1 + name.length + 1);
  return `${pad}<${name} ${parts.join(`\n${alignPad}`)}${tail}`;
}

function serializePretty(node: Node, depth: number, indent: string, align: boolean): string {
  const pad = indent.repeat(depth);
  switch (node.nodeType) {
    case Node.ELEMENT_NODE: {
      const el = node as Element;
      const kids = Array.from(el.childNodes).filter(
        (k) => !(k.nodeType === Node.TEXT_NODE && !(k.textContent ?? '').trim()),
      );
      if (kids.length === 0) return openTag(el, pad, align, true);
      const onlyText = kids.every((k) => k.nodeType === Node.TEXT_NODE || k.nodeType === Node.CDATA_SECTION_NODE);
      if (onlyText) {
        const text = kids
          .map((k) =>
            k.nodeType === Node.CDATA_SECTION_NODE
              ? `<![CDATA[${k.textContent ?? ''}]]>`
              : escText((k.textContent ?? '').trim()),
          )
          .join('');
        return `${openTag(el, pad, align, false)}${text}</${el.tagName}>`;
      }
      const inner = kids.map((k) => serializePretty(k, depth + 1, indent, align)).join('\n');
      return `${openTag(el, pad, align, false)}\n${inner}\n${pad}</${el.tagName}>`;
    }
    case Node.TEXT_NODE: {
      const t = (node.textContent ?? '').trim();
      return t ? pad + escText(t) : '';
    }
    case Node.CDATA_SECTION_NODE:
      return `${pad}<![CDATA[${node.textContent ?? ''}]]>`;
    case Node.COMMENT_NODE:
      return `${pad}<!--${node.textContent ?? ''}-->`;
    case Node.PROCESSING_INSTRUCTION_NODE: {
      const pi = node as ProcessingInstruction;
      return `${pad}<?${pi.target} ${pi.data}?>`;
    }
    default:
      return '';
  }
}

function serializeMin(node: Node): string {
  switch (node.nodeType) {
    case Node.ELEMENT_NODE: {
      const el = node as Element;
      const attrs = Array.from(el.attributes)
        .map((a) => ` ${a.name}="${escAttr(a.value)}"`)
        .join('');
      const kids = Array.from(el.childNodes).filter(
        (k) => !(k.nodeType === Node.TEXT_NODE && !(k.textContent ?? '').trim()),
      );
      if (kids.length === 0) return `<${el.tagName}${attrs}/>`;
      return `<${el.tagName}${attrs}>${kids.map(serializeMin).join('')}</${el.tagName}>`;
    }
    case Node.TEXT_NODE:
      return escText((node.textContent ?? '').trim());
    case Node.CDATA_SECTION_NODE:
      return `<![CDATA[${node.textContent ?? ''}]]>`;
    case Node.COMMENT_NODE:
      return `<!--${node.textContent ?? ''}-->`;
    case Node.PROCESSING_INSTRUCTION_NODE: {
      const pi = node as ProcessingInstruction;
      return `<?${pi.target} ${pi.data}?>`;
    }
    default:
      return '';
  }
}
