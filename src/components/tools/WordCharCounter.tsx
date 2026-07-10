import { useEffect, useMemo, useRef, useState } from 'react';
import { FieldLabel, OutputPane, useSweep } from './ui';

const SAMPLE = `Paste or type anything here. The counters update on every keystroke.

Reading time assumes 200 words per minute, the average for adult silent reading. Speaking time assumes a 130 wpm presentation pace.`;

function count(text: string) {
  const chars = text.length;
  const charsNoSpaces = text.replace(/\s/g, '').length;
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  const sentences = (text.match(/[^.!?…]+[.!?…]+(?=\s|$)/g) ?? (text.trim() ? [text] : [])).length;
  const paragraphs = text.trim() === '' ? 0 : text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const lines = text === '' ? 0 : text.split(/\r?\n/).length;
  return { chars, charsNoSpaces, words, sentences, paragraphs, lines };
}

function minutes(words: number, wpm: number): string {
  if (words === 0) return '0 min';
  const totalSec = Math.round((words / wpm) * 60);
  if (totalSec < 60) return `${totalSec} sec`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return s ? `${m} min ${s} sec` : `${m} min`;
}

export default function WordCharCounter() {
  const [text, setText] = useState(SAMPLE);
  const [sweep, triggerSweep] = useSweep();
  const stats = useMemo(() => count(text), [text]);
  const lastWords = useRef(-1);

  useEffect(() => {
    if (stats.words !== lastWords.current) {
      lastWords.current = stats.words;
      triggerSweep();
    }
  }, [stats.words, triggerSweep]);

  const cells: [string, string | number][] = [
    ['WORDS', stats.words],
    ['CHARACTERS', stats.chars],
    ['CHARS (NO SPACES)', stats.charsNoSpaces],
    ['SENTENCES', stats.sentences],
    ['PARAGRAPHS', stats.paragraphs],
    ['LINES', stats.lines],
    ['READING TIME', minutes(stats.words, 200)],
    ['SPEAKING TIME', minutes(stats.words, 130)],
  ];

  return (
    <div>
      <FieldLabel htmlFor="wc-text">TEXT</FieldLabel>
      <textarea
        id="wc-text"
        className="field"
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <OutputPane sweep={sweep} label="COUNTS">
        <dl className="grid grid-cols-2 gap-px sm:grid-cols-4" style={{ background: 'var(--hairline)', border: '1px solid var(--hairline)' }}>
          {cells.map(([label, value]) => (
            <div key={label} style={{ background: 'var(--paper)', padding: '10px 12px' }}>
              <dt className="ui-label" style={{ fontSize: 11 }}>
                {label}
              </dt>
              <dd className="tabular" style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 500 }}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </OutputPane>
    </div>
  );
}
