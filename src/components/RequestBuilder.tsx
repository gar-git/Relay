import { useMemo, useState, type CSSProperties } from 'react';
import type { AuthConfig, BodyType, HttpMethod, KeyValue, RequestBody } from '../lib/types';
import { parseBulkRows, serializeBulkRows } from '../lib/bulkEdit';
import { computeHiddenHeaders, newKv } from '../lib/utils';
import { FormDataEditor } from './FormDataEditor';
import { KeyValueEditor } from './KeyValueEditor';
import { MethodSelect } from './MethodSelect';

interface Props {
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  auth: AuthConfig;
  body: RequestBody;
  readOnly?: boolean;
  onMethod: (m: HttpMethod) => void;
  onUrl: (u: string) => void;
  onParams: (p: KeyValue[]) => void;
  onHeaders: (h: KeyValue[]) => void;
  onAuth: (a: AuthConfig) => void;
  onBody: (b: RequestBody) => void;
  onSend: () => void;
  onShowCurl: () => void;
  sending: boolean;
}

type ReqTab = 'params' | 'headers' | 'body' | 'auth';

const bulkBtnStyle: CSSProperties = {
  border: '1px solid #3d8bfd',
  background: '#1a3358',
  color: '#7eb6ff',
  fontWeight: 700,
  fontSize: 12,
  padding: '6px 14px',
  borderRadius: 6,
  cursor: 'pointer',
};

function BulkToolbar(props: {
  bulk: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 12,
        flexWrap: 'wrap',
        marginBottom: 8,
        width: '100%',
        minWidth: 0,
      }}
    >
      <button type="button" style={bulkBtnStyle} onClick={props.onToggle}>
        {props.bulk ? 'Key-Value Edit' : 'Bulk Edit'}
      </button>
    </div>
  );
}

function BulkTextArea(props: {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  placeholder: string;
  hint: string;
}) {
  return (
    <>
      <textarea
        rows={14}
        value={props.value}
        readOnly={props.readOnly}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        spellCheck={false}
        style={{
          width: '100%',
          minHeight: 220,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
          lineHeight: 1.5,
          boxSizing: 'border-box',
        }}
      />
      <p style={{ color: '#6b7a90', fontSize: 11, marginTop: 8 }}>{props.hint}</p>
    </>
  );
}

export function RequestBuilder(props: Props) {
  const [tab, setTab] = useState<ReqTab>('params');
  const [showHiddenHeaders, setShowHiddenHeaders] = useState(true);
  const [paramsBulk, setParamsBulk] = useState(false);
  const [paramsBulkText, setParamsBulkText] = useState('');
  const [formBulk, setFormBulk] = useState(false);
  const [formBulkText, setFormBulkText] = useState('');
  const [urlBulk, setUrlBulk] = useState(false);
  const [urlBulkText, setUrlBulkText] = useState('');

  const hiddenHeaders = useMemo(
    () =>
      computeHiddenHeaders({
        auth: props.auth,
        body: props.body,
        userHeaders: props.headers,
      }),
    [props.auth, props.body, props.headers],
  );

  const headerCount =
    props.headers.filter((h) => h.enabled && h.key).length +
    (showHiddenHeaders ? hiddenHeaders.length : 0);

  function setBodyType(type: BodyType) {
    setFormBulk(false);
    setUrlBulk(false);
    if (type === 'formdata') {
      props.onBody({
        ...props.body,
        type,
        formData: props.body.formData?.length ? props.body.formData : [{ ...newKv(), kind: 'text' }],
      });
      return;
    }
    if (type === 'urlencoded') {
      props.onBody({
        ...props.body,
        type,
        urlencoded: props.body.urlencoded?.length ? props.body.urlencoded : [newKv()],
      });
      return;
    }
    props.onBody({ ...props.body, type });
  }

  function toggleParamsBulk() {
    if (!paramsBulk) {
      setParamsBulkText(serializeBulkRows(props.params.filter((r) => r.key || r.value)));
      setParamsBulk(true);
    } else {
      if (!props.readOnly) {
        const parsed = parseBulkRows(paramsBulkText);
        props.onParams(parsed.length ? parsed : [newKv()]);
      }
      setParamsBulk(false);
    }
  }

  function toggleFormBulk() {
    const rows = props.body.formData || [];
    if (!formBulk) {
      setFormBulkText(serializeBulkRows(rows.filter((r) => r.key || r.value || r.filePath), true));
      setFormBulk(true);
    } else {
      if (!props.readOnly) {
        const parsed = parseBulkRows(formBulkText, true);
        props.onBody({
          ...props.body,
          formData: parsed.length ? parsed : [{ ...newKv(), kind: 'text' }],
        });
      }
      setFormBulk(false);
    }
  }

  function toggleUrlBulk() {
    const rows = props.body.urlencoded || [];
    if (!urlBulk) {
      setUrlBulkText(serializeBulkRows(rows.filter((r) => r.key || r.value)));
      setUrlBulk(true);
    } else {
      if (!props.readOnly) {
        const parsed = parseBulkRows(urlBulkText);
        props.onBody({ ...props.body, urlencoded: parsed.length ? parsed : [newKv()] });
      }
      setUrlBulk(false);
    }
  }

  return (
    <div className="panel">
      <div className="request-row" style={{ borderBottom: 'none', padding: '0 0 10px' }}>
        <MethodSelect value={props.method} onChange={props.onMethod} disabled={props.readOnly} />
        <input
          className="url-input"
          value={props.url}
          disabled={props.readOnly}
          placeholder="https://api.example.com/v1/resource or {{baseUrl}}/users"
          onChange={(e) => props.onUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') props.onSend();
          }}
        />
        <button type="button" onClick={props.onShowCurl} disabled={!props.url} title="View / copy as cURL">
          cURL
        </button>
        <button type="button" className="primary" onClick={props.onSend} disabled={props.sending || !props.url}>
          {props.sending ? 'Sending…' : 'Send'}
        </button>
      </div>

      <div className="panel-tabs">
        {(
          [
            ['params', `Params (${props.params.filter((p) => p.enabled && p.key).length})`],
            ['headers', `Headers (${headerCount})`],
            ['body', 'Body'],
            ['auth', 'Auth'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'active' : ''}
            onClick={() => {
              setTab(id);
              setParamsBulk(false);
              setFormBulk(false);
              setUrlBulk(false);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="panel-body">
        {tab === 'params' && (
          <div>
            <BulkToolbar bulk={paramsBulk} onToggle={toggleParamsBulk} />
            {paramsBulk ? (
              <BulkTextArea
                value={paramsBulkText}
                onChange={setParamsBulkText}
                readOnly={props.readOnly}
                placeholder={'page:1\nlimit:20'}
                hint="One parameter per line as key:value"
              />
            ) : (
              <KeyValueEditor
                rows={props.params}
                onChange={props.onParams}
                readOnly={props.readOnly}
              />
            )}
          </div>
        )}

        {tab === 'headers' && (
          <div>
            <div className="row" style={{ marginBottom: 10, justifyContent: 'space-between' }}>
              <label className="row" style={{ gap: 8, cursor: 'pointer', color: 'var(--text-dim)' }}>
                <input
                  type="checkbox"
                  checked={showHiddenHeaders}
                  onChange={(e) => setShowHiddenHeaders(e.target.checked)}
                />
                Show auto-generated headers
                {hiddenHeaders.length > 0 && <span className="chip">{hiddenHeaders.length} hidden</span>}
              </label>
            </div>

            {showHiddenHeaders && hiddenHeaders.length > 0 && (
              <table className="kv-table hidden-headers-table" style={{ marginBottom: 12 }}>
                <thead>
                  <tr>
                    <th style={{ width: 36 }} />
                    <th>Key</th>
                    <th>Value</th>
                    <th style={{ width: 90 }}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {hiddenHeaders.map((h) => (
                    <tr key={`${h.source}-${h.key}`} className="hidden-header-row" title={h.description}>
                      <td>
                        <span className="header-lock" title="Auto-generated">
                          🔒
                        </span>
                      </td>
                      <td>
                        <input type="text" value={h.key} disabled />
                      </td>
                      <td>
                        <input type="text" value={h.value} disabled />
                      </td>
                      <td>
                        <span className="chip">{h.source}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="section-title" style={{ paddingLeft: 0 }}>
              Your headers
            </div>
            <KeyValueEditor rows={props.headers} onChange={props.onHeaders} readOnly={props.readOnly} />
          </div>
        )}

        {tab === 'auth' && (
          <div className="auth-form">
            <label className="form-label">
              Type
              <select
                value={props.auth.type}
                disabled={props.readOnly}
                onChange={(e) => props.onAuth({ ...props.auth, type: e.target.value as AuthConfig['type'] })}
              >
                <option value="none">No Auth</option>
                <option value="bearer">Bearer Token</option>
                <option value="basic">Basic Auth</option>
                <option value="apikey">API Key</option>
              </select>
            </label>
            {props.auth.type === 'bearer' && (
              <label className="form-label">
                Token
                <input
                  value={props.auth.bearerToken || ''}
                  disabled={props.readOnly}
                  onChange={(e) => props.onAuth({ ...props.auth, bearerToken: e.target.value })}
                />
              </label>
            )}
            {props.auth.type === 'basic' && (
              <>
                <label className="form-label">
                  Username
                  <input
                    value={props.auth.basicUsername || ''}
                    disabled={props.readOnly}
                    onChange={(e) => props.onAuth({ ...props.auth, basicUsername: e.target.value })}
                  />
                </label>
                <label className="form-label">
                  Password
                  <input
                    type="password"
                    value={props.auth.basicPassword || ''}
                    disabled={props.readOnly}
                    onChange={(e) => props.onAuth({ ...props.auth, basicPassword: e.target.value })}
                  />
                </label>
              </>
            )}
            {props.auth.type === 'apikey' && (
              <>
                <label className="form-label">
                  Key
                  <input
                    value={props.auth.apiKeyKey || ''}
                    disabled={props.readOnly}
                    onChange={(e) => props.onAuth({ ...props.auth, apiKeyKey: e.target.value })}
                  />
                </label>
                <label className="form-label">
                  Value
                  <input
                    value={props.auth.apiKeyValue || ''}
                    disabled={props.readOnly}
                    onChange={(e) => props.onAuth({ ...props.auth, apiKeyValue: e.target.value })}
                  />
                </label>
                <label className="form-label">
                  Add to
                  <select
                    value={props.auth.apiKeyIn || 'header'}
                    disabled={props.readOnly}
                    onChange={(e) =>
                      props.onAuth({ ...props.auth, apiKeyIn: e.target.value as 'header' | 'query' })
                    }
                  >
                    <option value="header">Header</option>
                    <option value="query">Query Params</option>
                  </select>
                </label>
              </>
            )}
            {(props.auth.type === 'bearer' ||
              props.auth.type === 'basic' ||
              (props.auth.type === 'apikey' && (props.auth.apiKeyIn || 'header') === 'header')) && (
              <p className="muted" style={{ marginTop: 8 }}>
                This will appear as an auto-generated header in the Headers tab.
              </p>
            )}
          </div>
        )}

        {tab === 'body' && (
          <div>
            <div className="row" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              {(['none', 'json', 'raw', 'urlencoded', 'formdata'] as BodyType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={props.body.type === t ? 'primary' : ''}
                  disabled={props.readOnly}
                  onClick={() => setBodyType(t)}
                >
                  {t === 'formdata' ? 'form-data' : t === 'urlencoded' ? 'x-www-form-urlencoded' : t}
                </button>
              ))}
            </div>
            {(props.body.type === 'json' || props.body.type === 'raw') && (
              <textarea
                rows={16}
                style={{ width: '100%' }}
                value={props.body.raw || ''}
                disabled={props.readOnly}
                placeholder={props.body.type === 'json' ? '{\n  "key": "value"\n}' : 'Raw body'}
                onChange={(e) => props.onBody({ ...props.body, raw: e.target.value })}
              />
            )}
            {props.body.type === 'urlencoded' && (
              <div>
                <BulkToolbar bulk={urlBulk} onToggle={toggleUrlBulk} />
                {urlBulk ? (
                  <BulkTextArea
                    value={urlBulkText}
                    onChange={setUrlBulkText}
                    readOnly={props.readOnly}
                    placeholder={'name:Ada\nemail:a@b.com'}
                    hint="One field per line as key:value"
                  />
                ) : (
                  <KeyValueEditor
                    rows={props.body.urlencoded || []}
                    readOnly={props.readOnly}
                    onChange={(urlencoded) => props.onBody({ ...props.body, urlencoded })}
                  />
                )}
              </div>
            )}
            {props.body.type === 'formdata' && (
              <div>
                <BulkToolbar bulk={formBulk} onToggle={toggleFormBulk} />
                {formBulk ? (
                  <BulkTextArea
                    value={formBulkText}
                    onChange={setFormBulkText}
                    readOnly={props.readOnly}
                    placeholder={'name:Ada\navatar:@C:\\path\\to\\file.png'}
                    hint="Text: key:value · File: key:@/full/path"
                  />
                ) : (
                  <FormDataEditor
                    rows={props.body.formData || []}
                    readOnly={props.readOnly}
                    onChange={(formData) => props.onBody({ ...props.body, formData })}
                  />
                )}
              </div>
            )}
            {props.body.type === 'none' && <div className="empty">This request does not have a body</div>}
          </div>
        )}
      </div>
    </div>
  );
}
