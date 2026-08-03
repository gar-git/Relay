import type { AuthConfig, HttpMethod, KeyValue, RequestBody } from './types';
import { newKv, prettyJson } from './utils';

export interface ParsedCurl {
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  auth: AuthConfig;
  body: RequestBody;
}

const METHODS = new Set<string>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

/** Split a curl command into argv-like tokens (handles quotes and escapes). */
export function tokenizeCurl(input: string): string[] {
  let s = input.trim();
  // Line continuations: bash `\`, PowerShell `` ` ``, cmd `^`
  s = s.replace(/\\\r?\n/g, ' ');
  s = s.replace(/`\r?\n/g, ' ');
  s = s.replace(/\^\r?\n/g, ' ');
  s = s.replace(/\r?\n/g, ' ');

  const tokens: string[] = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i += 1;
    if (i >= s.length) break;

    const q = s[i];
    if (q === '"' || q === "'") {
      i += 1;
      let value = '';
      while (i < s.length && s[i] !== q) {
        if (s[i] === '\\' && q === '"' && i + 1 < s.length) {
          value += s[i + 1];
          i += 2;
          continue;
        }
        value += s[i];
        i += 1;
      }
      if (i < s.length) i += 1; // closing quote
      tokens.push(value);
      continue;
    }

    let value = '';
    while (i < s.length && !/\s/.test(s[i])) {
      value += s[i];
      i += 1;
    }
    tokens.push(value);
  }
  return tokens;
}

function splitHeader(raw: string): { key: string; value: string } | null {
  const idx = raw.indexOf(':');
  if (idx <= 0) return null;
  return {
    key: raw.slice(0, idx).trim(),
    value: raw.slice(idx + 1).trim(),
  };
}

function looksLikeJson(text: string): boolean {
  const t = text.trim();
  if (!(t.startsWith('{') || t.startsWith('['))) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

function parseUrlParts(url: string): { url: string; params: KeyValue[] } {
  try {
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) || url.startsWith('{{');
    const base = hasScheme ? url : `https://placeholder.local${url.startsWith('/') ? '' : '/'}${url}`;
    const u = new URL(base);
    const params: KeyValue[] = [];
    u.searchParams.forEach((value, key) => {
      params.push(newKv(key, value));
    });
    if (!params.length) return { url, params: [newKv()] };

    // Rebuild URL without query for the url field (params tab holds them)
    u.search = '';
    let cleaned = u.toString();
    if (!hasScheme) {
      cleaned = cleaned.replace(/^https:\/\/placeholder\.local/, '');
    }
    // Avoid trailing ? 
    cleaned = cleaned.replace(/\?$/, '');
    return { url: cleaned || url, params };
  } catch {
    const q = url.indexOf('?');
    if (q < 0) return { url, params: [newKv()] };
    const params: KeyValue[] = [];
    const search = url.slice(q + 1);
    for (const part of search.split('&')) {
      if (!part) continue;
      const eq = part.indexOf('=');
      const key = decodeURIComponent(eq >= 0 ? part.slice(0, eq) : part);
      const value = decodeURIComponent(eq >= 0 ? part.slice(eq + 1) : '');
      params.push(newKv(key, value));
    }
    return { url: url.slice(0, q), params: params.length ? params : [newKv()] };
  }
}

function parseUrlEncodedBody(raw: string): KeyValue[] {
  const rows: KeyValue[] = [];
  for (const part of raw.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = decodeURIComponent((eq >= 0 ? part.slice(0, eq) : part).replace(/\+/g, ' '));
    const value = decodeURIComponent((eq >= 0 ? part.slice(eq + 1) : '').replace(/\+/g, ' '));
    rows.push(newKv(key, value));
  }
  return rows.length ? rows : [newKv()];
}

/**
 * Parse a curl command into Relay request fields.
 * Supports common flags: -X/--request, -H/--header, -d/--data/--data-raw,
 * -F/--form, -u/--user, --url, and bare URL arguments.
 */
export function parseCurl(input: string): ParsedCurl {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Paste a cURL command first');

  const tokens = tokenizeCurl(trimmed);
  if (!tokens.length) throw new Error('Could not read cURL command');

  // Allow pasting without the word curl
  let start = 0;
  if (/^curl(\.exe)?$/i.test(tokens[0])) start = 1;

  let method: HttpMethod | null = null;
  let url = '';
  const headerRows: KeyValue[] = [];
  let auth: AuthConfig = { type: 'none' };
  let dataBody: string | null = null;
  let dataIsUrlEncoded = false;
  const formRows: KeyValue[] = [];
  let usedForm = false;

  const takeValue = (i: number): [string, number] => {
    if (i + 1 >= tokens.length) throw new Error(`Missing value after ${tokens[i]}`);
    return [tokens[i + 1], i + 1];
  };

  for (let i = start; i < tokens.length; i += 1) {
    const t = tokens[i];

    // Skip common no-op / noise flags
    if (
      t === '-s' ||
      t === '--silent' ||
      t === '-S' ||
      t === '--show-error' ||
      t === '-L' ||
      t === '--location' ||
      t === '-k' ||
      t === '--insecure' ||
      t === '-v' ||
      t === '--verbose' ||
      t === '-i' ||
      t === '--include' ||
      t === '--compressed' ||
      t === '--http1.1' ||
      t === '--http2'
    ) {
      continue;
    }

    if (t === '-X' || t === '--request') {
      const [val, next] = takeValue(i);
      const m = val.toUpperCase();
      if (!METHODS.has(m)) throw new Error(`Unsupported method: ${val}`);
      method = m as HttpMethod;
      i = next;
      continue;
    }

    if (t === '--url') {
      const [val, next] = takeValue(i);
      url = val;
      i = next;
      continue;
    }

    if (t === '-H' || t === '--header') {
      const [val, next] = takeValue(i);
      const h = splitHeader(val);
      if (h) headerRows.push(newKv(h.key, h.value));
      i = next;
      continue;
    }

    if (t === '-u' || t === '--user') {
      const [val, next] = takeValue(i);
      const colon = val.indexOf(':');
      auth = {
        type: 'basic',
        basicUsername: colon >= 0 ? val.slice(0, colon) : val,
        basicPassword: colon >= 0 ? val.slice(colon + 1) : '',
      };
      i = next;
      continue;
    }

    if (
      t === '-d' ||
      t === '--data' ||
      t === '--data-raw' ||
      t === '--data-binary' ||
      t === '--data-ascii'
    ) {
      const [val, next] = takeValue(i);
      dataBody = dataBody == null ? val : `${dataBody}&${val}`;
      i = next;
      continue;
    }

    if (t === '--data-urlencode') {
      const [val, next] = takeValue(i);
      dataBody = dataBody == null ? val : `${dataBody}&${val}`;
      dataIsUrlEncoded = true;
      i = next;
      continue;
    }

    if (t === '-F' || t === '--form' || t === '--form-string') {
      const [val, next] = takeValue(i);
      usedForm = true;
      const eq = val.indexOf('=');
      if (eq > 0) {
        const key = val.slice(0, eq);
        const value = val.slice(eq + 1);
        if (value.startsWith('@')) {
          formRows.push({
            ...newKv(key, value.slice(1)),
            kind: 'file',
            filePath: value.slice(1),
            fileName: value.slice(1).split(/[/\\]/).pop() || 'file',
          });
        } else {
          formRows.push({ ...newKv(key, value), kind: 'text' });
        }
      }
      i = next;
      continue;
    }

    if (t === '-b' || t === '--cookie') {
      const [val, next] = takeValue(i);
      headerRows.push(newKv('Cookie', val));
      i = next;
      continue;
    }

    if (t === '-A' || t === '--user-agent') {
      const [val, next] = takeValue(i);
      headerRows.push(newKv('User-Agent', val));
      i = next;
      continue;
    }

    if (t === '-e' || t === '--referer') {
      const [val, next] = takeValue(i);
      headerRows.push(newKv('Referer', val));
      i = next;
      continue;
    }

    // Combined short flags like -XPOST (rare) or -HContent-Type:...
    if (/^-X[A-Za-z]+$/.test(t)) {
      const m = t.slice(2).toUpperCase();
      if (METHODS.has(m)) method = m as HttpMethod;
      continue;
    }

    // Skip unknown long/short flags that take a value
    if (t.startsWith('--') && t.includes('=')) {
      continue;
    }
    if (t.startsWith('-') && t !== '-') {
      // Flags that typically take a following argument
      const withArg = new Set([
        '-o',
        '--output',
        '-w',
        '--write-out',
        '--connect-timeout',
        '--max-time',
        '-m',
        '--proxy',
        '-x',
        '--cert',
        '--key',
        '--cacert',
        '--resolve',
      ]);
      if (withArg.has(t) || t.startsWith('--')) {
        if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) i += 1;
        continue;
      }
      continue;
    }

    // Positional URL
    if (!t.startsWith('-') && (t.includes('://') || t.startsWith('{{') || t.startsWith('/') || t.startsWith('localhost'))) {
      url = t;
      continue;
    }

    // Bare host without scheme
    if (!t.startsWith('-') && !url && /^[\w.-]+(?::\d+)?(?:\/.*)?$/.test(t)) {
      url = t.includes('://') ? t : `http://${t}`;
    }
  }

  if (!url) throw new Error('No URL found in cURL command');

  // Infer method
  if (!method) {
    method = dataBody != null || usedForm ? 'POST' : 'GET';
  }

  // Auth from Authorization header if not set via -u
  if (auth.type === 'none') {
    const authHeader = headerRows.find((h) => h.key.toLowerCase() === 'authorization');
    if (authHeader) {
      const v = authHeader.value;
      const bearer = /^Bearer\s+(.+)$/i.exec(v);
      const basic = /^Basic\s+(.+)$/i.exec(v);
      if (bearer) {
        auth = { type: 'bearer', bearerToken: bearer[1] };
        // keep header too — Relay also generates it; drop duplicate user header
        const idx = headerRows.indexOf(authHeader);
        if (idx >= 0) headerRows.splice(idx, 1);
      } else if (basic) {
        try {
          const decoded = atob(basic[1]);
          const colon = decoded.indexOf(':');
          auth = {
            type: 'basic',
            basicUsername: colon >= 0 ? decoded.slice(0, colon) : decoded,
            basicPassword: colon >= 0 ? decoded.slice(colon + 1) : '',
          };
          const idx = headerRows.indexOf(authHeader);
          if (idx >= 0) headerRows.splice(idx, 1);
        } catch {
          /* keep as header */
        }
      }
    }
  }

  const { url: cleanUrl, params } = parseUrlParts(url);

  let body: RequestBody = { type: 'none' };
  if (usedForm) {
    body = {
      type: 'formdata',
      formData: formRows.length ? formRows : [{ ...newKv(), kind: 'text' }],
    };
  } else if (dataBody != null) {
    const contentType =
      headerRows.find((h) => h.key.toLowerCase() === 'content-type')?.value.toLowerCase() || '';
    if (
      dataIsUrlEncoded ||
      contentType.includes('application/x-www-form-urlencoded') ||
      (!looksLikeJson(dataBody) && dataBody.includes('=') && !dataBody.trim().startsWith('{'))
    ) {
      body = { type: 'urlencoded', urlencoded: parseUrlEncodedBody(dataBody) };
    } else if (looksLikeJson(dataBody) || contentType.includes('json')) {
      body = { type: 'json', raw: prettyJson(dataBody) };
    } else {
      body = { type: 'raw', raw: dataBody };
    }
  }

  // Ensure Content-Type for json if missing
  if (body.type === 'json' && !headerRows.some((h) => h.key.toLowerCase() === 'content-type')) {
    headerRows.push(newKv('Content-Type', 'application/json'));
  }

  return {
    method,
    url: cleanUrl,
    params,
    headers: headerRows.length ? headerRows : [newKv()],
    auth,
    body,
  };
}

export function isProbablyCurl(text: string): boolean {
  const t = text.trim();
  return /^curl(\.exe)?(\s|$)/i.test(t) || (/^\s*curl/im.test(t) && /-X|--request|-H|--header|--url|-d|--data/i.test(t));
}
