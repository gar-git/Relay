import { v4 as uuid } from 'uuid';
import type {
  AuthConfig,
  Collection,
  Environment,
  Folder,
  HttpMethod,
  KeyValue,
  SavedRequest,
} from '../src/lib/types';
import * as db from './db';
import { importOpenApiToCollection } from './openapi';

export interface RelayPackage {
  format: 'relay-workspace';
  version: 1;
  exportedAt: string;
  workspace: {
    name: string;
    members: { username: string; role: string }[];
  };
  collections: {
    name: string;
    description: string;
    folders: { id: string; parentId: string | null; name: string }[];
    requests: SavedRequest[];
  }[];
  environments: { name: string; variables: KeyValue[] }[];
  openapiSpecs: { name: string; content: string; version: string }[];
}

function kv(key: string, value: string, enabled = true): KeyValue {
  return { id: uuid(), key, value, enabled, secret: false };
}

export function exportWorkspace(workspaceId: string, userId: string): RelayPackage {
  db.assertMember(workspaceId, userId);
  const ws = db.getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const members = db.listMembers(workspaceId).map((m) => ({
    username: m.username,
    role: m.role,
  }));

  const collections = db.listCollections(workspaceId).map((c) => {
    const folders = db.listFolders(c.id).map((f) => ({
      id: f.id,
      parentId: f.parentId,
      name: f.name,
    }));
    const requests = db.listRequests(c.id);
    return {
      name: c.name,
      description: c.description,
      folders,
      requests,
    };
  });

  const environments = db.listEnvironments(workspaceId).map((e) => ({
    name: e.name,
    variables: e.variables,
  }));

  const openapiSpecs = db.listOpenApiSpecs(workspaceId).map((s) => ({
    name: s.name,
    content: s.content,
    version: s.version,
  }));

  return {
    format: 'relay-workspace',
    version: 1,
    exportedAt: new Date().toISOString(),
    workspace: { name: ws.name, members },
    collections,
    environments,
    openapiSpecs,
  };
}

export function importRelayPackage(userId: string, pkg: RelayPackage, workspaceName?: string) {
  if (pkg.format !== 'relay-workspace') throw new Error('Invalid Relay package');

  const name = workspaceName || `${pkg.workspace.name} (imported)`;
  const ws = db.createWorkspace(name, userId);

  // Invite / stub members (owner already added; skip self; respect max 15)
  for (const m of pkg.workspace.members) {
    if (m.role === 'owner') continue;
    const members = db.listMembers(ws.id);
    if (members.length >= 15) break;
    try {
      const user = db.ensureImportedUser(m.username);
      if (user.id === userId) continue;
      if (members.some((x) => x.userId === user.id)) continue;
      db.inviteMember(ws.id, userId, m.username, m.role === 'viewer' ? 'viewer' : 'editor');
    } catch {
      // skip if invite fails
    }
  }

  // Remove default Local env if we're importing envs
  const existingEnvs = db.listEnvironments(ws.id);
  for (const e of existingEnvs) {
    if (pkg.environments.length > 0) {
      try {
        db.deleteEnvironment(e.id, userId);
      } catch {
        /* ignore */
      }
    }
  }

  for (const env of pkg.environments) {
    const created = db.createEnvironment(ws.id, userId, env.name);
    db.updateEnvironment(created.id, userId, { variables: env.variables });
  }

  const folderIdMap = new Map<string, string>();

  for (const col of pkg.collections) {
    const collection = db.createCollection(ws.id, userId, col.name, col.description);
    folderIdMap.clear();
    // Create folders (parent-first: multiple passes)
    let pending = [...col.folders];
    let guard = 0;
    while (pending.length && guard++ < 100) {
      const next: typeof pending = [];
      for (const f of pending) {
        if (f.parentId && !folderIdMap.has(f.parentId)) {
          next.push(f);
          continue;
        }
        const parentId = f.parentId ? folderIdMap.get(f.parentId)! : null;
        const folder = db.createFolder(collection.id, userId, f.name, parentId);
        folderIdMap.set(f.id, folder.id);
      }
      if (next.length === pending.length) {
        // orphan parents — create at root
        for (const f of next) {
          const folder = db.createFolder(collection.id, userId, f.name, null);
          folderIdMap.set(f.id, folder.id);
        }
        break;
      }
      pending = next;
    }

    for (const r of col.requests) {
      db.saveRequest(userId, {
        collectionId: collection.id,
        folderId: r.folderId ? folderIdMap.get(r.folderId) ?? null : null,
        name: r.name,
        method: r.method,
        url: r.url,
        params: r.params,
        headers: r.headers,
        auth: r.auth,
        body: r.body,
      });
    }
  }

  for (const spec of pkg.openapiSpecs || []) {
    db.saveOpenApiSpec(ws.id, userId, spec.name, spec.content, spec.version);
  }

  return ws;
}

/** Postman Collection v2.1 export */
export function exportPostmanCollection(collectionId: string, userId: string) {
  let found: Collection | null = null;
  for (const w of db.listWorkspaces(userId)) {
    found = db.listCollections(w.id).find((c) => c.id === collectionId) || null;
    if (found) break;
  }
  if (!found) throw new Error('Collection not found');
  return buildPostman(found, userId);
}

function buildPostman(collection: Collection, userId: string) {
  db.assertMember(collection.workspaceId, userId);
  const folders = db.listFolders(collection.id);
  const requests = db.listRequests(collection.id);

  function requestToItem(r: SavedRequest) {
    const url = r.url;
    const header = r.headers
      .filter((h) => h.enabled && h.key)
      .map((h) => ({ key: h.key, value: h.value }));
    const query = r.params
      .filter((p) => p.enabled && p.key)
      .map((p) => ({ key: p.key, value: p.value }));

    let body: Record<string, unknown> | undefined;
    if (r.body.type === 'json' || r.body.type === 'raw') {
      body = {
        mode: 'raw',
        raw: r.body.raw || '',
        options: { raw: { language: r.body.type === 'json' ? 'json' : 'text' } },
      };
    } else if (r.body.type === 'urlencoded') {
      body = {
        mode: 'urlencoded',
        urlencoded: (r.body.urlencoded || [])
          .filter((x) => x.enabled)
          .map((x) => ({ key: x.key, value: x.value })),
      };
    } else if (r.body.type === 'formdata') {
      body = {
        mode: 'formdata',
        formdata: (r.body.formData || [])
          .filter((x) => x.enabled)
          .map((x) =>
            x.kind === 'file'
              ? {
                  key: x.key,
                  type: 'file',
                  src: x.filePath || x.fileName || x.value || '',
                }
              : { key: x.key, value: x.value, type: 'text' },
          ),
      };
    }

    let auth: Record<string, unknown> | undefined;
    if (r.auth.type === 'bearer') {
      auth = { type: 'bearer', bearer: [{ key: 'token', value: r.auth.bearerToken || '', type: 'string' }] };
    } else if (r.auth.type === 'basic') {
      auth = {
        type: 'basic',
        basic: [
          { key: 'username', value: r.auth.basicUsername || '', type: 'string' },
          { key: 'password', value: r.auth.basicPassword || '', type: 'string' },
        ],
      };
    } else if (r.auth.type === 'apikey') {
      auth = {
        type: 'apikey',
        apikey: [
          { key: 'key', value: r.auth.apiKeyKey || '', type: 'string' },
          { key: 'value', value: r.auth.apiKeyValue || '', type: 'string' },
          { key: 'in', value: r.auth.apiKeyIn || 'header', type: 'string' },
        ],
      };
    }

    return {
      name: r.name,
      request: {
        method: r.method,
        header,
        body,
        auth,
        url: {
          raw: url,
          query,
        },
        description: '',
      },
    };
  }

  const rootRequests = requests.filter((r) => !r.folderId);
  const folderItems = folders
    .filter((f) => !f.parentId)
    .map((f) => ({
      name: f.name,
      item: [
        ...folders
          .filter((c) => c.parentId === f.id)
          .map((c) => ({
            name: c.name,
            item: requests.filter((r) => r.folderId === c.id).map(requestToItem),
          })),
        ...requests.filter((r) => r.folderId === f.id).map(requestToItem),
      ],
    }));

  return {
    info: {
      name: collection.name,
      description: collection.description,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      _postman_id: collection.id,
    },
    item: [...folderItems, ...rootRequests.map(requestToItem)],
  };
}

function parsePostmanAuth(auth: Record<string, unknown> | undefined): AuthConfig {
  if (!auth || !auth.type || auth.type === 'noauth') return { type: 'none' };
  if (auth.type === 'bearer') {
    const arr = (auth.bearer as { key: string; value: string }[]) || [];
    return { type: 'bearer', bearerToken: arr.find((x) => x.key === 'token')?.value || '' };
  }
  if (auth.type === 'basic') {
    const arr = (auth.basic as { key: string; value: string }[]) || [];
    return {
      type: 'basic',
      basicUsername: arr.find((x) => x.key === 'username')?.value || '',
      basicPassword: arr.find((x) => x.key === 'password')?.value || '',
    };
  }
  if (auth.type === 'apikey') {
    const arr = (auth.apikey as { key: string; value: string }[]) || [];
    return {
      type: 'apikey',
      apiKeyKey: arr.find((x) => x.key === 'key')?.value || '',
      apiKeyValue: arr.find((x) => x.key === 'value')?.value || '',
      apiKeyIn: (arr.find((x) => x.key === 'in')?.value as 'header' | 'query') || 'header',
    };
  }
  return { type: 'none' };
}

function parsePostmanRequest(item: Record<string, unknown>, collectionId: string, folderId: string | null): SavedRequest {
  const req = (item.request || {}) as Record<string, unknown>;
  const method = String(req.method || 'GET').toUpperCase() as HttpMethod;
  let url = '';
  if (typeof req.url === 'string') url = req.url;
  else if (req.url && typeof req.url === 'object') {
    const u = req.url as Record<string, unknown>;
    url = String(u.raw || '');
  }

  const headersRaw = (req.header as { key: string; value: string; disabled?: boolean }[]) || [];
  const headers = headersRaw.map((h) => kv(h.key, h.value, !h.disabled));

  let params: KeyValue[] = [];
  if (req.url && typeof req.url === 'object') {
    const query = ((req.url as Record<string, unknown>).query as { key: string; value: string; disabled?: boolean }[]) || [];
    params = query.map((q) => kv(q.key, q.value || '', !q.disabled));
  }

  const bodyObj = req.body as Record<string, unknown> | undefined;
  let body: SavedRequest['body'] = { type: 'none' };
  if (bodyObj?.mode === 'raw') {
    const lang = ((bodyObj.options as Record<string, unknown>)?.raw as Record<string, unknown>)?.language;
    body = { type: lang === 'json' ? 'json' : 'raw', raw: String(bodyObj.raw || '') };
  } else if (bodyObj?.mode === 'urlencoded') {
    body = {
      type: 'urlencoded',
      urlencoded: ((bodyObj.urlencoded as { key: string; value: string }[]) || []).map((x) =>
        kv(x.key, x.value || ''),
      ),
    };
  } else if (bodyObj?.mode === 'formdata') {
    body = {
      type: 'formdata',
      formData: (
        (bodyObj.formdata as { key: string; value?: string; type?: string; src?: string | string[] }[]) || []
      ).map((x) => {
        const row = kv(x.key, x.value || '');
        if (x.type === 'file') {
          const src = Array.isArray(x.src) ? x.src[0] : x.src;
          const fileName = src ? String(src).split(/[/\\]/).pop() || String(src) : '';
          return {
            ...row,
            kind: 'file' as const,
            filePath: src ? String(src) : undefined,
            fileName,
            value: fileName,
          };
        }
        return { ...row, kind: 'text' as const };
      }),
    };
  }

  return {
    id: uuid(),
    collectionId,
    folderId,
    name: String(item.name || 'Request'),
    method,
    url,
    params,
    headers,
    auth: parsePostmanAuth(req.auth as Record<string, unknown>),
    body,
    sortOrder: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function importPostmanCollection(
  workspaceId: string,
  userId: string,
  postman: Record<string, unknown>,
): Collection {
  db.assertCanEdit(workspaceId, userId);
  const info = (postman.info || {}) as Record<string, unknown>;
  const collection = db.createCollection(
    workspaceId,
    userId,
    String(info.name || 'Imported Collection'),
    String(info.description || ''),
  );

  function walk(items: unknown[], parentFolderId: string | null) {
    for (const raw of items) {
      const item = raw as Record<string, unknown>;
      if (Array.isArray(item.item)) {
        const folder = db.createFolder(collection.id, userId, String(item.name || 'Folder'), parentFolderId);
        walk(item.item as unknown[], folder.id);
      } else if (item.request) {
        const r = parsePostmanRequest(item, collection.id, parentFolderId);
        db.insertRequestRaw(r);
      }
    }
  }

  walk((postman.item as unknown[]) || [], null);
  return collection;
}

export function detectAndImport(workspaceId: string, userId: string, content: string, nameHint?: string) {
  const trimmed = content.trim();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    json = null;
  }

  if (json?.format === 'relay-workspace') {
    const ws = importRelayPackage(userId, json as unknown as RelayPackage, nameHint);
    return { type: 'relay' as const, workspaceId: ws.id };
  }

  if (json?.info && (json.info as Record<string, unknown>).schema?.toString().includes('postman')) {
    const col = importPostmanCollection(workspaceId, userId, json);
    return { type: 'postman' as const, collectionId: col.id };
  }

  // OpenAPI / Swagger
  if (
    (json && (json.openapi || json.swagger)) ||
    trimmed.includes('openapi:') ||
    trimmed.includes('swagger:')
  ) {
    const result = importOpenApiToCollection(workspaceId, userId, content, nameHint);
    return { type: 'openapi' as const, ...result };
  }

  throw new Error('Unrecognized format. Supported: Relay workspace, Postman Collection v2.1, OpenAPI/Swagger');
}

export type { Environment, Folder };
