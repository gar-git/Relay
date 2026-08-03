import { useRef } from 'react';
import type { KeyValue } from '../lib/types';
import { newKv } from '../lib/utils';

interface Props {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  showSecret?: boolean;
  readOnly?: boolean;
}

export function KeyValueEditor({ rows, onChange, showSecret, readOnly }: Props) {
  // Keep a stable placeholder row when `rows` is empty so typing isn't lost each render.
  const placeholderRef = useRef<KeyValue | null>(null);
  if (rows.length) {
    placeholderRef.current = null;
  } else if (!placeholderRef.current) {
    placeholderRef.current = newKv();
  }

  const list = rows.length ? rows : [placeholderRef.current!];

  function update(id: string, patch: Partial<KeyValue>) {
    if (!rows.length) {
      const base = placeholderRef.current ?? newKv();
      const next = { ...base, id: base.id, ...patch };
      placeholderRef.current = next;
      onChange([next]);
      return;
    }
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function remove(id: string) {
    const next = rows.filter((r) => r.id !== id);
    onChange(next.length ? next : [newKv()]);
  }

  function add() {
    if (!rows.length) {
      const first = placeholderRef.current ?? newKv();
      onChange([first, newKv()]);
      return;
    }
    onChange([...rows, newKv()]);
  }

  return (
    <div className="kv-editor">
      <table className="kv-table kv-edit-table">
        <thead>
          <tr>
            <th className="kv-col-check" />
            <th className="kv-col-key">Key</th>
            <th className="kv-col-value">Value</th>
            {showSecret && <th className="kv-col-secret">Secret</th>}
            <th className="kv-col-action" />
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id}>
              <td className="kv-col-check">
                <input
                  type="checkbox"
                  checked={r.enabled}
                  disabled={readOnly}
                  onChange={(e) => update(r.id, { enabled: e.target.checked })}
                />
              </td>
              <td className="kv-col-key">
                <input
                  type="text"
                  value={r.key}
                  disabled={readOnly}
                  placeholder="Key"
                  onChange={(e) => update(r.id, { key: e.target.value })}
                />
              </td>
              <td className="kv-col-value">
                <input
                  type={r.secret ? 'password' : 'text'}
                  value={r.value}
                  disabled={readOnly}
                  placeholder="Value"
                  onChange={(e) => update(r.id, { value: e.target.value })}
                />
              </td>
              {showSecret && (
                <td className="kv-col-secret">
                  <input
                    type="checkbox"
                    checked={!!r.secret}
                    disabled={readOnly}
                    title="Secret"
                    onChange={(e) => update(r.id, { secret: e.target.checked })}
                  />
                </td>
              )}
              <td className="kv-col-action">
                {!readOnly && (
                  <button type="button" className="kv-delete" title="Delete" onClick={() => remove(r.id)}>
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && (
        <button type="button" className="kv-add-row" onClick={add}>
          Add row
        </button>
      )}
    </div>
  );
}
