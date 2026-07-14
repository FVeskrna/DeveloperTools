import { useEffect, useMemo, useState } from 'react';
import { FieldLabel } from './ui';

/**
 * Timezone selection without shipping the IANA database as DOM: a curated
 * native select (~19 options), plus a type-to-filter input whose full zone
 * list exists only in memory after hydration and renders at most 12 matches.
 */

const COMMON_ZONES = [
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Prague',
  'Europe/Madrid',
  'Europe/Kyiv',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Australia/Sydney',
];

interface Props {
  id: string;
  value: string;
  onChange: (tz: string) => void;
}

export default function TimeZonePicker({ id, value, onChange }: Props) {
  const [allZones, setAllZones] = useState<string[]>([]);
  const [local, setLocal] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    try {
      setLocal(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
      if ('supportedValuesOf' in Intl) {
        setAllZones((Intl as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone'));
      }
    } catch {
      /* curated list only */
    }
  }, []);

  const options = useMemo(() => {
    const head = [...(local && !COMMON_ZONES.includes(local) ? [local] : []), ...COMMON_ZONES];
    // Keep a zone picked via search visible in the select.
    if (value && !head.includes(value)) head.unshift(value);
    return [...new Set(head)];
  }, [local, value]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/\s+/g, '_');
    if (!q || allZones.length === 0) return [];
    return allZones.filter((z) => z.toLowerCase().includes(q)).slice(0, 12);
  }, [search, allZones]);

  return (
    <>
      <div>
        <FieldLabel htmlFor={id}>TIME ZONE</FieldLabel>
        <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((z) => (
            <option key={z} value={z}>
              {z}
              {z === local ? ' (local)' : ''}
            </option>
          ))}
        </select>
      </div>
      {allZones.length > 0 && (
        <div className="relative">
          <FieldLabel htmlFor={`${id}-search`}>ANY IANA ZONE</FieldLabel>
          <input
            id={`${id}-search`}
            className="field"
            style={{ width: 180 }}
            placeholder="type to filter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={matches.length > 0}
            aria-controls={`${id}-listbox`}
          />
          {matches.length > 0 && (
            <ul className="tz-menu" id={`${id}-listbox`} role="listbox" aria-label="Matching time zones">
              {matches.map((z) => (
                <li key={z} role="option" aria-selected={z === value}>
                  <button
                    type="button"
                    className="tz-option"
                    onClick={() => {
                      onChange(z);
                      setSearch('');
                    }}
                  >
                    {z}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
