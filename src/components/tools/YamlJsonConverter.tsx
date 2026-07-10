import { useEffect, useMemo, useRef, useState } from 'react';
import { load, dump, YAMLException } from 'js-yaml';
import { CopyButton, ErrorLine, FieldLabel, OutputPane, useSweep } from './ui';

type Direction = 'yaml-to-json' | 'json-to-yaml';

const SAMPLE_YAML = `service: billing-api
replicas: 3
env:
  - name: LOG_LEVEL
    value: info
  - name: TIMEOUT_MS
    value: 4500
healthcheck:
  path: /healthz
  interval: 30s
`;

function jsonErrorLine(source: string, err: Error): number | undefined {
  const m = err.message.match(/position (\d+)/);
  if (!m) return undefined;
  return source.slice(0, Number(m[1])).split('\n').length;
}

export default function YamlJsonConverter() {
  const [direction, setDirection] = useState<Direction>('yaml-to-json');
  const [input, setInput] = useState(SAMPLE_YAML);
  const [sweep, triggerSweep] = useSweep();
  const lastGood = useRef('');

  // Computed at render, so the server-rendered page already shows the
  // converted sample — output is visible before hydration, with no shift.
  const { output, error } = useMemo<{
    output: string;
    error: { message: string; line?: number } | null;
  }>(() => {
    if (!input.trim()) return { output: '', error: null };
    try {
      const result =
        direction === 'yaml-to-json'
          ? (JSON.stringify(load(input), null, 2) ?? 'null')
          : dump(JSON.parse(input), { indent: 2, lineWidth: 100 });
      return { output: result, error: null };
    } catch (e) {
      if (e instanceof YAMLException) {
        return {
          output: '',
          error: { message: e.reason ?? e.message, line: e.mark ? e.mark.line + 1 : undefined },
        };
      }
      if (e instanceof Error) {
        return { output: '', error: { message: e.message, line: jsonErrorLine(input, e) } };
      }
      return { output: '', error: { message: String(e) } };
    }
  }, [input, direction]);

  useEffect(() => {
    if (output && output !== lastGood.current) {
      lastGood.current = output;
      triggerSweep();
    }
  }, [output, triggerSweep]);

  const swap = () => {
    if (!error && output) {
      setInput(output);
      setDirection((d) => (d === 'yaml-to-json' ? 'json-to-yaml' : 'yaml-to-json'));
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="ui-label">DIRECTION:</span>
        <button
          type="button"
          className="btn"
          aria-pressed={direction === 'yaml-to-json'}
          onClick={() => setDirection('yaml-to-json')}
        >
          YAML → JSON
        </button>
        <button
          type="button"
          className="btn"
          aria-pressed={direction === 'json-to-yaml'}
          onClick={() => setDirection('json-to-yaml')}
        >
          JSON → YAML
        </button>
        <button type="button" className="btn" onClick={swap} disabled={!!error || !output}>
          ⇄ USE OUTPUT AS INPUT
        </button>
      </div>

      <div className="mt-4">
        <FieldLabel htmlFor="yj-input">{direction === 'yaml-to-json' ? 'YAML IN' : 'JSON IN'}</FieldLabel>
        <textarea
          id="yj-input"
          className="field"
          rows={10}
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
        label={direction === 'yaml-to-json' ? 'JSON OUT' : 'YAML OUT'}
        actions={<CopyButton text={() => output} />}
      >
        <pre
          className="field"
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', minHeight: 160, margin: 0 }}
          aria-live="polite"
        >
          {error ? '' : output}
        </pre>
      </OutputPane>
    </div>
  );
}
