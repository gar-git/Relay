import { useEffect, useState } from 'react';
import type { AuthConfig, HttpMethod, KeyValue, OpenApiSpec, RequestBody } from '../lib/types';
import { METHOD_COLORS, newKv } from '../lib/utils';

interface Parsed {
  title: string;
  version: string;
  baseUrl: string;
  endpoints: {
    method: HttpMethod;
    path: string;
    operationId: string;
    summary: string;
    description: string;
    tags: string[];
    parameters: { name: string; in: string; required: boolean; example: string }[];
    requestBodyExample: string | null;
    consumes: string[];
  }[];
}

interface Props {
  token: string;
  workspaceId: string;
  canEdit: boolean;
  onImported: () => void;
  onTry: (data: {
    method: HttpMethod;
    url: string;
    params: KeyValue[];
    headers: KeyValue[];
    auth: AuthConfig;
    body: RequestBody;
    name: string;
  }) => void;
}

export function DocsViewer({ token, workspaceId, canEdit, onImported, onTry }: Props) {
  const [specs, setSpecs] = useState<OpenApiSpec[]>([]);
  const [activeSpecId, setActiveSpecId] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [paste, setPaste] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const list = await window.relay.openapi.list(token, workspaceId);
    setSpecs(list);
    if (!activeSpecId && list[0]) setActiveSpecId(list[0].id);
  }

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
  }, [token, workspaceId]);

  useEffect(() => {
    async function load() {
      if (!activeSpecId) {
        setParsed(null);
        return;
      }
      const spec = await window.relay.openapi.get(token, activeSpecId);
      if (!spec) return;
      const p = await window.relay.openapi.parse(spec.content);
      setParsed(p);
    }
    load().catch((e) => setError(String(e)));
  }, [activeSpecId, token]);

  async function importContent(content: string, name?: string) {
    setBusy(true);
    setError('');
    try {
      await window.relay.openapi.import(token, workspaceId, content, name);
      await refresh();
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function importFile() {
    const file = await window.relay.dialog.openFile();
    if (!file) return;
    await importContent(file.content, file.name);
  }

  async function importFromUrl() {
    if (!url.trim()) return;
    setBusy(true);
    setError('');
    try {
      const content = await window.relay.openapi.fetchUrl(url.trim());
      await importContent(content, url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function tryEndpoint(ep: Parsed['endpoints'][0]) {
    const base = parsed?.baseUrl?.replace(/\/$/, '') || '';
    let path = ep.path;
    const params: KeyValue[] = [];
    const headers: KeyValue[] = [newKv('Accept', 'application/json')];
    for (const p of ep.parameters) {
      if (p.in === 'query') params.push(newKv(p.name, p.example));
      else if (p.in === 'header') headers.push(newKv(p.name, p.example));
      else if (p.in === 'path' && p.example) path = path.replace(`{${p.name}}`, encodeURIComponent(p.example));
    }
    if (ep.requestBodyExample) headers.push(newKv('Content-Type', 'application/json'));
    onTry({
      method: ep.method,
      url: `${base}${path}`,
      params,
      headers,
      auth: { type: 'none' },
      body: ep.requestBodyExample ? { type: 'json', raw: ep.requestBodyExample } : { type: 'none' },
      name: ep.summary,
    });
  }

  return (
    <div className="panel-body">
      <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <select
          value={activeSpecId || ''}
          onChange={(e) => setActiveSpecId(e.target.value || null)}
          style={{ minWidth: 180 }}
        >
          <option value="">Select spec…</option>
          {specs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {s.version ? `(${s.version})` : ''}
            </option>
          ))}
        </select>
        {canEdit && (
          <>
            <button type="button" onClick={importFile} disabled={busy}>
              Import file
            </button>
            <input
              placeholder="OpenAPI URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              style={{ flex: 1, minWidth: 160 }}
            />
            <button type="button" onClick={importFromUrl} disabled={busy}>
              Fetch URL
            </button>
          </>
        )}
      </div>

      {canEdit && (
        <details style={{ marginBottom: 12 }}>
          <summary className="muted">Paste OpenAPI / Swagger JSON or YAML</summary>
          <textarea
            rows={8}
            style={{ width: '100%', marginTop: 8 }}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="openapi: 3.0.0 …"
          />
          <button
            type="button"
            className="primary"
            style={{ marginTop: 8 }}
            disabled={busy || !paste.trim()}
            onClick={() => importContent(paste)}
          >
            Import pasted spec
          </button>
        </details>
      )}

      {error && <div className="error-text">{error}</div>}

      {parsed ? (
        <div>
          <div className="row" style={{ marginBottom: 10 }}>
            <strong>{parsed.title}</strong>
            <span className="chip">{parsed.version}</span>
            <span className="muted" style={{ fontFamily: 'var(--mono)' }}>
              {parsed.baseUrl}
            </span>
            <span className="chip">{parsed.endpoints.length} endpoints</span>
          </div>
          <div className="docs-list">
            {parsed.endpoints.map((ep) => (
              <div key={`${ep.method}-${ep.path}`} className="docs-endpoint">
                <div className="row">
                  <span className="method-badge" style={{ color: METHOD_COLORS[ep.method] }}>
                    {ep.method}
                  </span>
                  <code style={{ fontFamily: 'var(--mono)' }}>{ep.path}</code>
                  <span className="spacer" />
                  <button type="button" onClick={() => tryEndpoint(ep)}>
                    Try
                  </button>
                </div>
                <div style={{ marginTop: 4 }}>{ep.summary}</div>
                {ep.description && (
                  <div className="muted" style={{ marginTop: 4 }}>
                    {ep.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="empty">Import an OpenAPI / Swagger spec to document and try your APIs</div>
      )}
    </div>
  );
}
