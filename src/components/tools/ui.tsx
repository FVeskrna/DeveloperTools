import { useCallback, useState, type ReactNode } from 'react';

/**
 * The site's single micro-interaction: a 200ms accent sweep along the output
 * pane's top hairline whenever a tool produces output. Re-triggering remounts
 * the sweep element (key change) so the animation replays.
 */
export function useSweep(): [number, () => void] {
  const [n, setN] = useState(0);
  const trigger = useCallback(() => setN((v) => v + 1), []);
  return [n, trigger];
}

export function OutputPane({
  sweep,
  label,
  actions,
  children,
}: {
  sweep: number;
  label?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="output-pane mt-5">
      {sweep > 0 && <span key={sweep} className="sweep-line run" aria-hidden="true" />}
      {(label || actions) && (
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 pt-3 pb-2">
          {label ? <span className="ui-label">{label}</span> : <span />}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function CopyButton({ text, label = 'COPY' }: { text: string | (() => string); label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn"
      onClick={async () => {
        const value = typeof text === 'function' ? text() : text;
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable — nothing sensible to do */
        }
      }}
    >
      {copied ? 'COPIED' : label}
    </button>
  );
}

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label className="ui-label mb-1.5 block" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

export function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p className="ui-label status-error mt-2" role="alert">
      {children}
    </p>
  );
}
