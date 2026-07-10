import { useEffect, useRef, useState } from 'react';
import { formatXml } from '../../lib/xml';
import { CopyButton, ErrorLine, FieldLabel, OutputPane, useSweep } from './ui';

const SAMPLE = `<fetch top="50"><entity name="account"><attribute name="name" /><attribute name="primarycontactid" /><attribute name="revenue" /><filter type="and"><condition attribute="statecode" operator="eq" value="0" /><condition attribute="revenue" operator="gt" value="100000" /></filter><link-entity name="contact" from="contactid" to="primarycontactid" link-type="outer" alias="pc"><attribute name="emailaddress1" /></link-entity><order attribute="revenue" descending="true" /></entity></fetch>`;

/** Verbatim C# string: double every quote, wrap in @"...". */
function toCSharp(xml: string): string {
  return `var fetchXml = @"\n${xml.replace(/"/g, '""')}";`;
}

export default function FetchXmlFormatter() {
  const [input, setInput] = useState(SAMPLE);
  const [indent, setIndent] = useState<'2' | '4'>('2');
  const [align, setAlign] = useState(true);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<{ message: string; line?: number } | null>(null);
  const [sweep, triggerSweep] = useSweep();
  const lastGood = useRef('');

  useEffect(() => {
    if (!input.trim()) {
      setOutput('');
      setError(null);
      return;
    }
    const result = formatXml(input, {
      indent: ' '.repeat(Number(indent)),
      alignAttributes: align,
    });
    if (result.ok) {
      setOutput(result.output);
      setError(null);
      if (result.output !== lastGood.current) {
        lastGood.current = result.output;
        triggerSweep();
      }
    } else {
      setError({ message: result.error, line: result.line });
    }
  }, [input, indent, align, triggerSweep]);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <FieldLabel htmlFor="fx-indent">INDENT</FieldLabel>
          <select
            id="fx-indent"
            className="field"
            value={indent}
            onChange={(e) => setIndent(e.target.value as '2' | '4')}
          >
            <option value="2">2 spaces</option>
            <option value="4">4 spaces</option>
          </select>
        </div>
        <label className="ui-label flex cursor-pointer items-center gap-1.5 pb-2.5">
          <input
            type="checkbox"
            checked={align}
            onChange={(e) => setAlign(e.target.checked)}
            style={{ accentColor: 'var(--accent)' }}
          />
          ALIGN ATTRIBUTES
        </label>
      </div>

      <div className="mt-4">
        <FieldLabel htmlFor="fx-input">FETCHXML IN</FieldLabel>
        <textarea
          id="fx-input"
          className="field"
          rows={8}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
        />
      </div>

      {error && (
        <ErrorLine>
          {error.line !== undefined ? `LINE ${error.line}: ` : ''}
          {error.message}
        </ErrorLine>
      )}

      <OutputPane
        sweep={sweep}
        label="FORMATTED"
        actions={
          <>
            <CopyButton text={() => output} />
            <CopyButton text={() => toCSharp(output)} label="COPY AS C# STRING" />
          </>
        }
      >
        <pre
          className="field"
          style={{ whiteSpace: 'pre', overflowX: 'auto', minHeight: 470, margin: 0 }}
          aria-live="polite"
        >
          {output}
        </pre>
      </OutputPane>
    </div>
  );
}
