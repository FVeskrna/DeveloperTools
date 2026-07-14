import { useEffect, useMemo, useRef, useState } from 'react';
import { CopyButton, FieldLabel, OutputPane, useSweep } from './ui';

const HEADER_LINES = [
  'OData-MaxVersion: 4.0',
  'OData-Version: 4.0',
  'Accept: application/json',
  'Prefer: odata.include-annotations="*"',
];

const stripSpaces = (csv: string) =>
  csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(',');

export default function DataverseUrlBuilder() {
  const [orgUrl, setOrgUrl] = useState('https://yourorg.crm.dynamics.com');
  const [entitySet, setEntitySet] = useState('accounts');
  const [select, setSelect] = useState('name, revenue, statecode');
  const [filter, setFilter] = useState("statecode eq 0 and revenue gt 100000");
  const [expand, setExpand] = useState('primarycontactid');
  const [expandSelect, setExpandSelect] = useState('fullname, emailaddress1');
  const [orderby, setOrderby] = useState('revenue');
  const [orderDir, setOrderDir] = useState<'asc' | 'desc'>('desc');
  const [top, setTop] = useState('10');
  const [count, setCount] = useState(false);
  const [snippet, setSnippet] = useState<'fetch' | 'csharp'>('fetch');
  const [sweep, triggerSweep] = useSweep();
  const lastGood = useRef('');

  const url = useMemo(() => {
    const base = `${orgUrl.trim().replace(/\/+$/, '')}/api/data/v9.2/${entitySet.trim()}`;
    const qs: string[] = [];
    if (stripSpaces(select)) qs.push(`$select=${stripSpaces(select)}`);
    if (filter.trim()) qs.push(`$filter=${filter.trim()}`);
    if (expand.trim()) {
      const nested = stripSpaces(expandSelect);
      qs.push(`$expand=${expand.trim()}${nested ? `($select=${nested})` : ''}`);
    }
    if (orderby.trim()) qs.push(`$orderby=${orderby.trim()} ${orderDir}`);
    if (top.trim() && Number(top) > 0) qs.push(`$top=${Number(top)}`);
    if (count) qs.push('$count=true');
    // encodeURI escapes spaces/quotes but keeps $ = & , ( ) intact — what Dataverse expects.
    return encodeURI(`${base}${qs.length > 0 ? `?${qs.join('&')}` : ''}`);
  }, [orgUrl, entitySet, select, filter, expand, expandSelect, orderby, orderDir, top, count]);

  useEffect(() => {
    if (url !== lastGood.current) {
      lastGood.current = url;
      triggerSweep();
    }
  }, [url, triggerSweep]);

  const snippetText = useMemo(() => {
    if (snippet === 'fetch') {
      return `const response = await fetch(
  "${url}",
  {
    headers: {
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      "Accept": "application/json",
      "Prefer": 'odata.include-annotations="*"',
      "Authorization": \`Bearer \${accessToken}\`,
    },
  },
);
if (!response.ok) throw new Error(\`\${response.status}: \${await response.text()}\`);
const data = await response.json();
console.log(data.value);`;
    }
    return `using var client = new HttpClient();
client.DefaultRequestHeaders.Add("OData-MaxVersion", "4.0");
client.DefaultRequestHeaders.Add("OData-Version", "4.0");
client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
client.DefaultRequestHeaders.Add("Prefer", "odata.include-annotations=\\"*\\"");
client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

var response = await client.GetAsync(
    "${url}");
response.EnsureSuccessStatusCode();
var json = await response.Content.ReadAsStringAsync();`;
  }, [snippet, url]);

  const text = (id: string, label: string, value: string, set: (v: string) => void, width?: number, placeholder?: string) => (
    <div style={width ? { width } : { flex: '1 1 220px', minWidth: 180 }}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input
        id={id}
        className="field"
        value={value}
        onChange={(e) => set(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {text('dv-org', 'ORG URL', orgUrl, setOrgUrl)}
        {text('dv-entity', 'ENTITY SET (PLURAL)', entitySet, setEntitySet, 200)}
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {text('dv-select', '$SELECT — COLUMNS, COMMA-SEPARATED', select, setSelect)}
      </div>
      <div className="mt-3">
        <FieldLabel htmlFor="dv-filter">$FILTER</FieldLabel>
        <input
          id="dv-filter"
          className="field"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <p className="ink-secondary mt-1" style={{ fontSize: 12 }}>
          Free OData text — build complex conditions with the <a href="/tools/odata-filter-builder/">OData Filter Builder</a> and paste the expression here.
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {text('dv-expand', '$EXPAND — NAV PROPERTY', expand, setExpand, 220, 'primarycontactid')}
        {text('dv-expand-select', 'NESTED $SELECT', expandSelect, setExpandSelect)}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        {text('dv-orderby', '$ORDERBY', orderby, setOrderby, 180)}
        <div>
          <FieldLabel htmlFor="dv-dir">DIRECTION</FieldLabel>
          <select id="dv-dir" className="field" value={orderDir} onChange={(e) => setOrderDir(e.target.value as 'asc' | 'desc')}>
            <option value="asc">ascending</option>
            <option value="desc">descending</option>
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="dv-top">$TOP</FieldLabel>
          <input
            id="dv-top"
            className="field tabular"
            style={{ width: 90 }}
            type="number"
            min={0}
            value={top}
            onChange={(e) => setTop(e.target.value)}
          />
        </div>
        <label className="ui-label flex cursor-pointer items-center gap-1.5 pb-2.5">
          <input type="checkbox" checked={count} onChange={(e) => setCount(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
          $COUNT=TRUE
        </label>
      </div>

      <OutputPane sweep={sweep} label="REQUEST URL" actions={<CopyButton text={() => url} label="COPY URL" />}>
        <pre className="field" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', minHeight: 64, margin: 0 }} aria-live="polite">
          GET {url}
        </pre>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <span className="ui-label">REQUEST HEADERS</span>
          <CopyButton text={() => HEADER_LINES.join('\n')} label="COPY HEADERS" />
        </div>
        <pre className="field mt-1.5" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
          {HEADER_LINES.join('\n')}
        </pre>
        <p className="ink-secondary mt-1" style={{ fontSize: 12 }}>
          include-annotations returns formatted values and lookup names alongside raw values.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span className="ui-label">CODE SNIPPET:</span>
            <button type="button" className="btn" aria-pressed={snippet === 'fetch'} onClick={() => setSnippet('fetch')}>
              FETCH()
            </button>
            <button type="button" className="btn" aria-pressed={snippet === 'csharp'} onClick={() => setSnippet('csharp')}>
              C# HTTPCLIENT
            </button>
          </span>
          <CopyButton text={() => snippetText} label="COPY SNIPPET" />
        </div>
        <pre className="field mt-1.5" style={{ whiteSpace: 'pre', overflowX: 'auto', margin: 0 }}>
          {snippetText}
        </pre>
      </OutputPane>
    </div>
  );
}
