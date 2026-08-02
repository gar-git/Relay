import yaml from 'js-yaml';
import { v4 as uuid } from 'uuid';
import type { AuthConfig, HttpMethod, KeyValue, SavedRequest } from '../src/lib/types';
import * as db from './db';

type AnyObj = Record<string, unknown>;

function kv(key: string, value: string, enabled = true): KeyValue {
  return { id: uuid(), key, value, enabled };
}

function parseSpec(content: string): AnyObj {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed) as AnyObj;
  }
  return yaml.load(trimmed) as AnyObj;
}

function resolveRef(root: AnyObj, ref: string): AnyObj | null {
  if (!ref.startsWith('#/')) return null;
  const parts = ref.slice(2).split('/');
  let cur: unknown = root;
  for (const p of parts) {
    if (!cur || typeof cur !== 'object') return null;
    cur = (cur as AnyObj)[p];
  }
  return (cur as AnyObj) ?? null;
}

function getBaseUrl(spec: AnyObj): string {
  if (spec.openapi && Array.isArray(spec.servers) && spec.servers.length > 0) {
    return String((spec.servers[0] as AnyObj).url || '');
  }
  if (spec.swagger === '2.0') {
    const host = String(spec.host || 'localhost');
    const basePath = String(spec.basePath || '');
    const schemes = (spec.schemes as string[]) || ['https'];
    return `${schemes[0]}://${host}${basePath}`;
  }
  return '';
}

function exampleFromSchema(schema: AnyObj | null | undefined, root: AnyObj): unknown {
  if (!schema) return undefined;
  if (schema.$ref) {
    return exampleFromSchema(resolveRef(root, String(schema.$ref)), root);
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  const type = schema.type as string | undefined;
  if (type === 'object' || schema.properties) {
    const props = (schema.properties || {}) as Record<string, AnyObj>;
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      obj[k] = exampleFromSchema(v, root) ?? null;
    }
    return obj;
  }
  if (type === 'array') {
    const item = exampleFromSchema(schema.items as AnyObj, root);
    return item !== undefined ? [item] : [];
  }
  if (type === 'integer' || type === 'number') return 0;
  if (type === 'boolean') return false;
  if (type === 'string') {
    if (schema.format === 'date-time') return new Date().toISOString();
    if (schema.enum) return (schema.enum as unknown[])[0];
    return 'string';
  }
  return null;
}

export interface ParsedEndpoint {
  method: HttpMethod;
  path: string;
  operationId: string;
  summary: string;
  description: string;
  tags: string[];
  parameters: { name: string; in: string; required: boolean; example: string }[];
  requestBodyExample: string | null;
  consumes: string[];
}

export function listEndpoints(content: string): { title: string; version: string; baseUrl: string; endpoints: ParsedEndpoint[] } {
  const spec = parseSpec(content);
  const title =
    ((spec.info as AnyObj)?.title as string) ||
    'API';
  const version = ((spec.info as AnyObj)?.version as string) || '';
  const baseUrl = getBaseUrl(spec);
  const paths = (spec.paths || {}) as Record<string, AnyObj>;
  const endpoints: ParsedEndpoint[] = [];
  const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const method of methods) {
      const op = pathItem[method.toLowerCase()] as AnyObj | undefined;
      if (!op) continue;

      const parameters: ParsedEndpoint['parameters'] = [];
      const paramList = [
        ...((pathItem.parameters as AnyObj[]) || []),
        ...((op.parameters as AnyObj[]) || []),
      ];
      for (const p of paramList) {
        let param = p;
        if (p.$ref) param = resolveRef(spec, String(p.$ref)) || p;
        const schema = (param.schema as AnyObj) || {};
        const example =
          param.example !== undefined
            ? String(param.example)
            : schema.example !== undefined
              ? String(schema.example)
              : '';
        parameters.push({
          name: String(param.name),
          in: String(param.in || 'query'),
          required: Boolean(param.required),
          example,
        });
      }

      let requestBodyExample: string | null = null;
      let consumes: string[] = [];
      if (op.requestBody) {
        const rb = op.requestBody as AnyObj;
        const contentMap = (rb.content || {}) as Record<string, AnyObj>;
        consumes = Object.keys(contentMap);
        const json = contentMap['application/json'];
        if (json) {
          const ex =
            json.example ??
            (json.examples ? Object.values(json.examples as AnyObj)[0] : undefined) ??
            exampleFromSchema(json.schema as AnyObj, spec);
          if (ex !== undefined) {
            const val = (ex as AnyObj)?.value !== undefined ? (ex as AnyObj).value : ex;
            requestBodyExample = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
          }
        }
      } else if (op.consumes || pathItem) {
        // swagger 2
        const bodyParam = paramList.find((p) => {
          const x = p.$ref ? resolveRef(spec, String(p.$ref)) : p;
          return x && (x as AnyObj).in === 'body';
        });
        if (bodyParam) {
          const resolved = (bodyParam.$ref ? resolveRef(spec, String(bodyParam.$ref)) : bodyParam) as AnyObj;
          const ex = exampleFromSchema(resolved.schema as AnyObj, spec);
          if (ex !== undefined) requestBodyExample = JSON.stringify(ex, null, 2);
        }
        consumes = (op.consumes as string[]) || [];
      }

      endpoints.push({
        method,
        path,
        operationId: String(op.operationId || `${method}_${path}`),
        summary: String(op.summary || op.operationId || `${method} ${path}`),
        description: String(op.description || ''),
        tags: (op.tags as string[]) || ['default'],
        parameters,
        requestBodyExample,
        consumes,
      });
    }
  }

  return { title, version, baseUrl, endpoints };
}

export function importOpenApiToCollection(
  workspaceId: string,
  userId: string,
  content: string,
  collectionName?: string,
): { collectionId: string; requestCount: number; specId: string } {
  db.assertCanEdit(workspaceId, userId);
  const parsed = listEndpoints(content);
  const name = collectionName || parsed.title || 'OpenAPI Collection';
  const collection = db.createCollection(workspaceId, userId, name, `Imported from OpenAPI ${parsed.version}`);
  const spec = db.saveOpenApiSpec(workspaceId, userId, name, content, parsed.version);

  const tagFolders = new Map<string, string>();
  let sort = 0;

  for (const ep of parsed.endpoints) {
    const tag = ep.tags[0] || 'default';
    if (!tagFolders.has(tag)) {
      const folder = db.createFolder(collection.id, userId, tag);
      tagFolders.set(tag, folder.id);
    }
    const folderId = tagFolders.get(tag)!;

    const params: KeyValue[] = [];
    const headers: KeyValue[] = [kv('Accept', 'application/json')];
    let url = `${parsed.baseUrl.replace(/\/$/, '')}${ep.path}`;

    for (const p of ep.parameters) {
      if (p.in === 'query') {
        params.push(kv(p.name, p.example, true));
      } else if (p.in === 'header') {
        headers.push(kv(p.name, p.example || '', true));
      } else if (p.in === 'path' && p.example) {
        url = url.replace(`{${p.name}}`, encodeURIComponent(p.example));
      }
    }

    const auth: AuthConfig = { type: 'none' };
    const body =
      ep.requestBodyExample != null
        ? { type: 'json' as const, raw: ep.requestBodyExample }
        : { type: 'none' as const };

    if (ep.requestBodyExample != null) {
      headers.push(kv('Content-Type', 'application/json'));
    }

    const req: SavedRequest = {
      id: uuid(),
      collectionId: collection.id,
      folderId,
      name: ep.summary,
      method: ep.method,
      url,
      params,
      headers,
      auth,
      body,
      sortOrder: sort++,
      updatedAt: new Date().toISOString(),
    };
    db.insertRequestRaw(req);
  }

  return { collectionId: collection.id, requestCount: parsed.endpoints.length, specId: spec.id };
}

export async function fetchOpenApiFromUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch OpenAPI: ${res.status} ${res.statusText}`);
  return await res.text();
}

export { parseSpec };
