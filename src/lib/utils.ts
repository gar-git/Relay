import { v4 as uuid } from 'uuid';
import type { AuthConfig, KeyValue, RequestBody, SendRequestPayload } from './types';

export function newKv(key = '', value = '', enabled = true, secret = false): KeyValue {
  return { id: uuid(), key, value, enabled, secret };
}

export function resolveVariables(input: string, vars: Record<string, string>): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
    const matched = Object.keys(vars).find((k) => k.toLowerCase() === name.toLowerCase());
    return matched !== undefined ? vars[matched] : `{{${name}}}`;
  });
}

/** Names still present as {{var}} after resolution. */
export function findUnresolvedVariables(input: string): string[] {
  const names: string[] = [];
  const re = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (!names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

export function varsFromEnv(variables: KeyValue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of variables) {
    if (v.enabled && v.key.trim()) out[v.key.trim()] = v.value;
  }
  return out;
}

export function buildSendPayload(opts: {
  method: SendRequestPayload['method'];
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  auth: AuthConfig;
  body: RequestBody;
  variables: Record<string, string>;
}): SendRequestPayload {
  const vars = opts.variables;
  let url = resolveVariables(opts.url.trim(), vars);

  const enabledParams = opts.params.filter((p) => p.enabled && p.key);
  if (enabledParams.length) {
    const q = enabledParams
      .map(
        (p) =>
          `${encodeURIComponent(resolveVariables(p.key, vars))}=${encodeURIComponent(resolveVariables(p.value, vars))}`,
      )
      .join('&');
    url = url.includes('?') ? `${url}&${q}` : `${url}?${q}`;
  }

  const headers: Record<string, string> = {};
  for (const h of opts.headers) {
    if (h.enabled && h.key) {
      headers[resolveVariables(h.key, vars)] = resolveVariables(h.value, vars);
    }
  }

  if (opts.auth.type === 'bearer' && opts.auth.bearerToken) {
    headers['Authorization'] = `Bearer ${resolveVariables(opts.auth.bearerToken, vars)}`;
  } else if (opts.auth.type === 'basic') {
    const user = resolveVariables(opts.auth.basicUsername || '', vars);
    const pass = resolveVariables(opts.auth.basicPassword || '', vars);
    headers['Authorization'] = `Basic ${btoa(`${user}:${pass}`)}`;
  } else if (opts.auth.type === 'apikey') {
    const key = resolveVariables(opts.auth.apiKeyKey || '', vars);
    const value = resolveVariables(opts.auth.apiKeyValue || '', vars);
    if (opts.auth.apiKeyIn === 'query') {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    } else if (key) {
      headers[key] = value;
    }
  }

  let body: string | null = null;
  if (opts.body.type === 'json' || opts.body.type === 'raw') {
    body = resolveVariables(opts.body.raw || '', vars);
    if (opts.body.type === 'json' && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
  } else if (opts.body.type === 'urlencoded') {
    const parts = (opts.body.urlencoded || [])
      .filter((x) => x.enabled && x.key)
      .map(
        (x) =>
          `${encodeURIComponent(resolveVariables(x.key, vars))}=${encodeURIComponent(resolveVariables(x.value, vars))}`,
      );
    body = parts.join('&');
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  } else if (opts.body.type === 'formdata') {
    const boundary = '----RelayFormBoundary' + Math.random().toString(36).slice(2);
    const parts: NonNullable<SendRequestPayload['multipart']>['parts'] = [];
    for (const x of opts.body.formData || []) {
      if (!x.enabled || !x.key) continue;
      const name = resolveVariables(x.key, vars);
      if (x.kind === 'file') {
        if (!x.filePath) continue;
        parts.push({
          name,
          kind: 'file',
          filePath: x.filePath,
          fileName: x.fileName || x.value || 'file',
        });
      } else {
        parts.push({
          name,
          kind: 'text',
          value: resolveVariables(x.value, vars),
        });
      }
    }
    headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
    return {
      method: opts.method,
      url,
      headers,
      body: null,
      multipart: { boundary, parts },
    };
  }

  return {
    method: opts.method,
    url,
    headers,
    body,
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Build a bash-compatible curl command from the current request (env vars resolved). */
export function buildCurl(opts: {
  method: SendRequestPayload['method'];
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  auth: AuthConfig;
  body: RequestBody;
  variables: Record<string, string>;
}): string {
  const vars = opts.variables;
  let url = resolveVariables(opts.url.trim(), vars);

  const enabledParams = opts.params.filter((p) => p.enabled && p.key);
  if (enabledParams.length) {
    const q = enabledParams
      .map(
        (p) =>
          `${encodeURIComponent(resolveVariables(p.key, vars))}=${encodeURIComponent(resolveVariables(p.value, vars))}`,
      )
      .join('&');
    url = url.includes('?') ? `${url}&${q}` : `${url}?${q}`;
  }

  const headers: Record<string, string> = {};
  for (const h of opts.headers) {
    if (h.enabled && h.key) {
      headers[resolveVariables(h.key, vars)] = resolveVariables(h.value, vars);
    }
  }

  if (opts.auth.type === 'bearer' && opts.auth.bearerToken) {
    headers['Authorization'] = `Bearer ${resolveVariables(opts.auth.bearerToken, vars)}`;
  } else if (opts.auth.type === 'basic') {
    const user = resolveVariables(opts.auth.basicUsername || '', vars);
    const pass = resolveVariables(opts.auth.basicPassword || '', vars);
    headers['Authorization'] = `Basic ${btoa(`${user}:${pass}`)}`;
  } else if (opts.auth.type === 'apikey') {
    const key = resolveVariables(opts.auth.apiKeyKey || '', vars);
    const value = resolveVariables(opts.auth.apiKeyValue || '', vars);
    if (opts.auth.apiKeyIn === 'query') {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    } else if (key) {
      headers[key] = value;
    }
  }

  const parts: string[] = ['curl', '--location', '--request', opts.method, shellQuote(url)];

  const isForm = opts.body.type === 'formdata';
  for (const [k, v] of Object.entries(headers)) {
    if (isForm && k.toLowerCase() === 'content-type') continue;
    parts.push(`\\\n  --header ${shellQuote(`${k}: ${v}`)}`);
  }

  if (opts.body.type === 'json' || opts.body.type === 'raw') {
    const raw = resolveVariables(opts.body.raw || '', vars);
    if (raw) {
      if (opts.body.type === 'json' && !Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
        parts.push(`\\\n  --header ${shellQuote('Content-Type: application/json')}`);
      }
      parts.push(`\\\n  --data-raw ${shellQuote(raw)}`);
    }
  } else if (opts.body.type === 'urlencoded') {
    const raw = (opts.body.urlencoded || [])
      .filter((x) => x.enabled && x.key)
      .map(
        (x) =>
          `${encodeURIComponent(resolveVariables(x.key, vars))}=${encodeURIComponent(resolveVariables(x.value, vars))}`,
      )
      .join('&');
    if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
      parts.push(`\\\n  --header ${shellQuote('Content-Type: application/x-www-form-urlencoded')}`);
    }
    if (raw) parts.push(`\\\n  --data-raw ${shellQuote(raw)}`);
  } else if (opts.body.type === 'formdata') {
    for (const x of opts.body.formData || []) {
      if (!x.enabled || !x.key) continue;
      const key = resolveVariables(x.key, vars);
      if (x.kind === 'file' && x.filePath) {
        parts.push(`\\\n  --form ${shellQuote(`${key}=@${x.filePath}`)}`);
      } else {
        const value = resolveVariables(x.value, vars);
        parts.push(`\\\n  --form ${shellQuote(`${key}=${value}`)}`);
      }
    }
  }

  return parts.join(' ');
}

export interface HiddenHeader {
  key: string;
  value: string;
  source: 'auth' | 'body' | 'default';
  description: string;
}

/** Auto headers Relay will send (like Postman's hidden headers). */
export function computeHiddenHeaders(opts: {
  auth: AuthConfig;
  body: RequestBody;
  userHeaders: KeyValue[];
}): HiddenHeader[] {
  const userKeys = new Set(
    opts.userHeaders.filter((h) => h.enabled && h.key).map((h) => h.key.toLowerCase()),
  );
  const hidden: HiddenHeader[] = [];

  const add = (key: string, value: string, source: HiddenHeader['source'], description: string) => {
    if (!key || userKeys.has(key.toLowerCase())) return;
    if (hidden.some((h) => h.key.toLowerCase() === key.toLowerCase())) return;
    hidden.push({ key, value, source, description });
  };

  if (opts.auth.type === 'bearer' && opts.auth.bearerToken) {
    add(
      'Authorization',
      `Bearer ${opts.auth.bearerToken}`,
      'auth',
      'Added from Authorization → Bearer Token',
    );
  } else if (opts.auth.type === 'basic') {
    const user = opts.auth.basicUsername || '';
    const pass = opts.auth.basicPassword || '';
    add(
      'Authorization',
      `Basic ${btoa(`${user}:${pass}`)}`,
      'auth',
      'Added from Authorization → Basic Auth',
    );
  } else if (opts.auth.type === 'apikey' && (opts.auth.apiKeyIn || 'header') === 'header') {
    const key = opts.auth.apiKeyKey || '';
    const value = opts.auth.apiKeyValue || '';
    if (key) {
      add(key, value, 'auth', 'Added from Authorization → API Key');
    }
  }

  if (opts.body.type === 'json') {
    add('Content-Type', 'application/json', 'body', 'Added from Body → JSON');
  } else if (opts.body.type === 'urlencoded') {
    add(
      'Content-Type',
      'application/x-www-form-urlencoded',
      'body',
      'Added from Body → x-www-form-urlencoded',
    );
  } else if (opts.body.type === 'formdata') {
    add('Content-Type', 'multipart/form-data', 'body', 'Added from Body → form-data (boundary set on send)');
  }

  add('Accept', '*/*', 'default', 'Default Accept header');
  add('User-Agent', 'Relay/1.0.0', 'default', 'Relay client identifier');
  add('Accept-Encoding', 'gzip, deflate, br', 'default', 'Default Accept-Encoding');
  add('Connection', 'keep-alive', 'default', 'Default Connection');

  return hidden;
}

export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function statusColor(status: number): string {
  if (status >= 200 && status < 300) return 'var(--ok)';
  if (status >= 300 && status < 400) return 'var(--warn)';
  if (status >= 400) return 'var(--err)';
  return 'var(--muted)';
}

/** Postman-style HTTP method colors */
export const METHOD_COLORS: Record<string, string> = {
  GET: '#6BDD9A',
  POST: '#FFCC66',
  PUT: '#74C0FC',
  PATCH: '#C5A8FF',
  DELETE: '#F5A8A8',
  HEAD: '#7ED7C1',
  OPTIONS: '#F5A0D0',
};
