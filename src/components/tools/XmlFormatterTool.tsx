import { useEffect, useRef, useState } from 'react';
import { formatXml } from '../../lib/xml';
import { CopyButton, ErrorLine, FieldLabel, OutputPane, useSweep } from './ui';

type Mode = 'pretty' | 'minify';
type Indent = '2' | '4' | 'tab';

const SAMPLE = `<config env="production"><service name="billing-api" replicas="3"><endpoint path="/healthz" interval="30s" /><timeout ms="4500" /></service><notes><![CDATA[Line numbers matter & are reported.]]></notes></config>`;

export default function XmlFormatterTool() {
  const [input, setInput] = useState(SAMPLE);
  const [mode, setMode] = useState<Mode>('pretty');
  const [indent, setIndent] = useState<Indent>('2');
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
      minify: mode === 'minify',
      indent: indent === 'tab' ? '\t' : ' '.repeat(Number(indent)),
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
  }, [input, mode, indent, triggerSweep]);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-end gap-2">
          <div>
            <span className="ui-label mb-1.5 block">MODE</span>
            <div className="flex gap-2">
              <button type="button" className="btn" aria-pressed={mode === 'pretty'} onClick={() => setMode('pretty')}>
                PRETTY-PRINT
              </button>
              <button type="button" className="btn" aria-pressed={mode === 'minify'} onClick={() => setMode('minify')}>
                MINIFY
              </button>
            </div>
          </div>
        </div>
        {mode === 'pretty' && (
          <div>
            <FieldLabel htmlFor="xmlf-indent">INDENT</FieldLabel>
            <select
              id="xmlf-indent"
              className="field"
              value={indent}
              onChange={(e) => setIndent(e.target.value as Indent)}
            >
              <option value="2">2 spaces</option>
              <option value="4">4 spaces</option>
              <option value="tab">tabs</option>
            </select>
          </div>
        )}
        <span
          className={`ui-label pb-2 ${error ? 'status-error' : 'status-ok'}`}
          role="status"
        >
          {error ? '✕ NOT WELL-FORMED' : '✓ WELL-FORMED'}
        </span>
      </div>

      <div className="mt-4">
        <FieldLabel htmlFor="xmlf-input">XML IN</FieldLabel>
        <textarea
          id="xmlf-input"
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

      <OutputPane sweep={sweep} label="OUTPUT" actions={<CopyButton text={() => output} />}>
        <pre
          className="field"
          style={{ whiteSpace: 'pre', overflowX: 'auto', minHeight: 300, margin: 0 }}
          aria-live="polite"
        >
          {output}
        </pre>
      </OutputPane>
    </div>
  );
}
