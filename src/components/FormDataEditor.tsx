import { useRef } from 'react';
import type { KeyValue } from '../lib/types';
import { newKv } from '../lib/utils';

interface Props {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  readOnly?: boolean;
}

function newFormRow(): KeyValue {
  return { ...newKv(), kind: 'text' };
}

export function FormDataEditor({ rows, onChange, readOnly }: Props) {
  const placeholderRef = useRef<KeyValue | null>(null);
  if (rows.length) {
    placeholderRef.current = null;
  } else if (!placeholderRef.current) {
    placeholderRef.current = newFormRow();
  }

  const list = rows.length ? rows : [placeholderRef.current!];

  function update(id: string, patch: Partial<KeyValue>) {
    if (!rows.length) {
      const base = placeholderRef.current ?? newFormRow();
      const next = { ...base, id: base.id, ...patch };
      placeholderRef.current = next;
      onChange([next]);
      return;
    }
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function remove(id: string) {
    const next = rows.filter((r) => r.id !== id);
    onChange(next.length ? next : [newFormRow()]);
  }

  function add() {
    if (!rows.length) {
      const first = placeholderRef.current ?? newFormRow();
      onChange([first, newFormRow()]);
      return;
    }
    onChange([...rows, newFormRow()]);
  }

  async function pickFile(id: string) {
    const file = await window.relay.dialog.pickFile();
    if (!file) return;
    update(id, {
      kind: 'file',
      filePath: file.path,
      fileName: file.name,
      value: file.name,
    });
  }

  return (
    <div className="kv-editor">
      <table className="kv-table kv-edit-table">
        <thead>
          <tr>
            <th className="kv-col-check" />
            <th className="kv-col-key">Key</th>
            <th className="kv-col-type">Type</th>
            <th className="kv-col-value">Value</th>
            <th className="kv-col-action" />
          </tr>
        </thead>
        <tbody>
          {list.map((r) => {
            const kind = r.kind === 'file' ? 'file' : 'text';
            return (
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
                <td className="kv-col-type">
                  <select
                    className="fd-type-select"
                    value={kind}
                    disabled={readOnly}
                    onChange={(e) => {
                      const next = e.target.value as 'text' | 'file';
                      if (next === 'file') {
                        update(r.id, {
                          kind: 'file',
                          value: r.fileName || '',
                          filePath: r.filePath,
                          fileName: r.fileName,
                        });
                      } else {
                        update(r.id, { kind: 'text', filePath: undefined, fileName: undefined });
                      }
                    }}
                  >
                    <option value="text">Text</option>
                    <option value="file">File</option>
                  </select>
                </td>
                <td className="kv-col-value">
                  {kind === 'file' ? (
                    <button
                      type="button"
                      className="fd-select-files"
                      disabled={readOnly}
                      onClick={() => void pickFile(r.id)}
                      title={r.filePath || 'Select file'}
                    >
                      {r.fileName || 'Select Files'}
                    </button>
                  ) : (
                    <input
                      type="text"
                      value={r.value}
                      disabled={readOnly}
                      placeholder="Value"
                      onChange={(e) => update(r.id, { value: e.target.value })}
                    />
                  )}
                </td>
                <td className="kv-col-action">
                  {!readOnly && (
                    <button type="button" className="kv-delete" title="Delete" onClick={() => remove(r.id)}>
                      ×
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
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
