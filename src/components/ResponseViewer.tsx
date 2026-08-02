import { useMemo, useState } from 'react';
import type { SendRequestResult } from '../lib/types';
import { prettyJson, statusColor } from '../lib/utils';
import { JsonViewer } from './JsonViewer';

interface Props {
  result: SendRequestResult | null;
  loading: boolean;
}

function looksLikeJson(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (!(t.startsWith('{') || t.startsWith('['))) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

export function ResponseViewer({ result, loading }: Props) {
  const [tab, setTab] = useState<'body' | 'headers'>('body');
  const [pretty, setPretty] = useState(true);
  const [wrap, setWrap] = useState(true);

  const isJson = useMemo(() => (result ? looksLikeJson(result.body) : false), [result]);

  const bodyText = useMemo(() => {
    if (!result) return '';
    if (pretty && isJson) return prettyJson(result.body);
    return result.body;
  }, [result, pretty, isJson]);

  async function copyBody() {
    if (!bodyText) return;
    try {
      await navigator.clipboard.writeText(bodyText);
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <div className="panel">
        <div className="meta-row">Sending…</div>
        <div className="panel-body empty">Waiting for response</div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="panel">
        <div className="meta-row">Response</div>
        <div className="panel-body empty">Send a request to see the response</div>
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="panel">
        <div className="meta-row">
          <span style={{ color: 'var(--err)' }}>Error</span>
          <span>{result.durationMs} ms</span>
        </div>
        <div className="panel-body">
          <pre className="response-body" style={{ color: 'var(--err)' }}>
            {result.error}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="meta-row">
        {isJson && (
          <button type="button" className="ghost" onClick={() => setPretty((p) => !p)}>
            {pretty ? 'Raw' : 'Pretty'}
          </button>
        )}
        <button type="button" className={`ghost${wrap ? ' active-soft' : ''}`} onClick={() => setWrap((w) => !w)}>
          Wrap
        </button>
        <button type="button" className="ghost" onClick={() => void copyBody()} disabled={!bodyText}>
          Copy
        </button>
        <span style={{ color: statusColor(result.status), fontWeight: 700 }}>
          {result.status} {result.statusText}
        </span>
        <span>{result.durationMs} ms</span>
        <span>
          {result.sizeBytes < 1024
            ? `${result.sizeBytes} B`
            : `${(result.sizeBytes / 1024).toFixed(2)} KB`}
        </span>
      </div>
      <div className="panel-tabs">
        <button type="button" className={tab === 'body' ? 'active' : ''} onClick={() => setTab('body')}>
          Body
        </button>
        <button type="button" className={tab === 'headers' ? 'active' : ''} onClick={() => setTab('headers')}>
          Headers ({Object.keys(result.headers).length})
        </button>
      </div>
      <div className={`panel-body${tab === 'body' ? ' response-panel-body' : ''}`}>
        {tab === 'body' ? (
          isJson && pretty ? (
            <JsonViewer text={bodyText} wrap={wrap} />
          ) : (
            <pre className={`response-body${wrap ? ' wrap' : ''}`}>{bodyText || '(empty)'}</pre>
          )
        ) : (
          <table className="kv-table">
            <thead>
              <tr>
                <th>Header</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(result.headers).map(([k, v]) => (
                <tr key={k}>
                  <td style={{ fontFamily: 'var(--mono)' }}>{k}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
