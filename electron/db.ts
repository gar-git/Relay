import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import type {
  AuthConfig,
  Collection,
  Environment,
  Folder,
  HistoryEntry,
  HttpMethod,
  KeyValue,
  OpenApiSpec,
  RequestBody,
  Role,
  SavedRequest,
  User,
  Workspace,
  WorkspaceMember,
} from '../src/lib/types';
import { MAX_TEAM_SIZE } from '../src/lib/types';

// sql.js may expose default or the function itself depending on bundler interop
const loadSql = (initSqlJs as unknown as { default?: typeof initSqlJs }).default || initSqlJs;

let SQL: SqlJsStatic;
let db: Database;
let dbPath: string;

function now() {
  return new Date().toISOString();
}

function saveDb() {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params as never[]);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

function queryOne<T>(sql: string, params: unknown[] = []): T | null {
  const rows = queryAll<T>(sql, params);
  return rows[0] ?? null;
}

function run(sql: string, params: unknown[] = []) {
  db.run(sql, params as never[]);
  saveDb();
}

export async function initDb() {
  const wasmCandidates = [
    path.join(app.getAppPath(), 'node_modules', 'sql.js', 'dist'),
    path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist'),
    path.join(process.cwd(), 'node_modules', 'sql.js', 'dist'),
  ];
  const wasmDir = wasmCandidates.find((dir) => fs.existsSync(path.join(dir, 'sql-wasm.wasm')));
  if (!wasmDir) {
    throw new Error('Could not locate sql.js wasm file. Run npm install.');
  }

  SQL = await loadSql({
    locateFile: (file: string) => path.join(wasmDir, file),
  });

  const userData = app.getPath('userData');
  dbPath = path.join(userData, 'relay.sqlite');

  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')),
      joined_at TEXT NOT NULL,
      UNIQUE(workspace_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      method TEXT NOT NULL,
      url TEXT NOT NULL DEFAULT '',
      params_json TEXT NOT NULL DEFAULT '[]',
      headers_json TEXT NOT NULL DEFAULT '[]',
      auth_json TEXT NOT NULL DEFAULT '{"type":"none"}',
      body_json TEXT NOT NULL DEFAULT '{"type":"none"}',
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS environments (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      variables_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_workspace_state (
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      active_env_id TEXT,
      PRIMARY KEY (user_id, workspace_id)
    );

    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      method TEXT NOT NULL,
      url TEXT NOT NULL,
      status INTEGER,
      duration_ms INTEGER,
      request_snapshot TEXT NOT NULL,
      response_snapshot TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS openapi_specs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);
  saveDb();
}

function mapUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    username: row.username as string,
    displayName: row.display_name as string,
    createdAt: row.created_at as string,
  };
}

export function registerUser(username: string, password: string, displayName?: string): User {
  const trimmed = username.trim();
  if (!trimmed || password.length < 4) {
    throw new Error('Username required and password must be at least 4 characters');
  }
  const existing = queryOne('SELECT id FROM users WHERE username = ?', [trimmed]);
  if (existing) throw new Error('Username already taken');

  const id = uuid();
  const createdAt = now();
  const hash = bcrypt.hashSync(password, 10);
  run(
    'INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, trimmed, displayName?.trim() || trimmed, hash, createdAt],
  );
  return { id, username: trimmed, displayName: displayName?.trim() || trimmed, createdAt };
}

export function loginUser(username: string, password: string): { user: User; token: string } {
  const row = queryOne<Record<string, unknown>>(
    'SELECT * FROM users WHERE username = ?',
    [username.trim()],
  );
  if (!row || !bcrypt.compareSync(password, row.password_hash as string)) {
    throw new Error('Invalid username or password');
  }
  const token = uuid();
  run('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', [token, row.id, now()]);
  return { user: mapUser(row), token };
}

export function logoutUser(token: string) {
  run('DELETE FROM sessions WHERE token = ?', [token]);
}

export function getUserByToken(token: string): User | null {
  const row = queryOne<Record<string, unknown>>(
    `SELECT u.* FROM users u
     JOIN sessions s ON s.user_id = u.id
     WHERE s.token = ?`,
    [token],
  );
  return row ? mapUser(row) : null;
}

export function listUsers(): User[] {
  return queryAll<Record<string, unknown>>('SELECT id, username, display_name, created_at FROM users ORDER BY username').map(
    mapUser,
  );
}

function memberCount(workspaceId: string): number {
  const row = queryOne<{ c: number }>('SELECT COUNT(*) as c FROM workspace_members WHERE workspace_id = ?', [
    workspaceId,
  ]);
  return row?.c ?? 0;
}

export function createWorkspace(name: string, ownerId: string): Workspace {
  const id = uuid();
  const createdAt = now();
  // Use transaction-like sequential ops
  db.run('INSERT INTO workspaces (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)', [
    id,
    name.trim(),
    ownerId,
    createdAt,
  ]);
  db.run(
    'INSERT INTO workspace_members (id, workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)',
    [uuid(), id, ownerId, 'owner', createdAt],
  );
  // Default environment
  db.run(
    'INSERT INTO environments (id, workspace_id, name, variables_json, created_at) VALUES (?, ?, ?, ?, ?)',
    [uuid(), id, 'Local', '[]', createdAt],
  );
  saveDb();
  return { id, name: name.trim(), ownerId, createdAt, memberCount: 1 };
}

export function listWorkspaces(userId: string): Workspace[] {
  return queryAll<Record<string, unknown>>(
    `SELECT w.*, (SELECT COUNT(*) FROM workspace_members m WHERE m.workspace_id = w.id) as member_count
     FROM workspaces w
     JOIN workspace_members m ON m.workspace_id = w.id
     WHERE m.user_id = ?
     ORDER BY w.name`,
    [userId],
  ).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    ownerId: row.owner_id as string,
    createdAt: row.created_at as string,
    memberCount: row.member_count as number,
  }));
}

export function getWorkspace(workspaceId: string): Workspace | null {
  const row = queryOne<Record<string, unknown>>(
    `SELECT w.*, (SELECT COUNT(*) FROM workspace_members m WHERE m.workspace_id = w.id) as member_count
     FROM workspaces w WHERE w.id = ?`,
    [workspaceId],
  );
  if (!row) return null;
  return {
    id: row.id as string,
    name: row.name as string,
    ownerId: row.owner_id as string,
    createdAt: row.created_at as string,
    memberCount: row.member_count as number,
  };
}

export function getMemberRole(workspaceId: string, userId: string): Role | null {
  const row = queryOne<{ role: Role }>(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [workspaceId, userId],
  );
  return row?.role ?? null;
}

export function assertMember(workspaceId: string, userId: string): Role {
  const role = getMemberRole(workspaceId, userId);
  if (!role) throw new Error('Not a member of this workspace');
  return role;
}

export function assertCanEdit(workspaceId: string, userId: string) {
  const role = assertMember(workspaceId, userId);
  if (role === 'viewer') throw new Error('Viewers cannot modify this workspace');
  return role;
}

export function listMembers(workspaceId: string): WorkspaceMember[] {
  return queryAll<Record<string, unknown>>(
    `SELECT m.*, u.username, u.display_name
     FROM workspace_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.workspace_id = ?
     ORDER BY m.role, u.username`,
    [workspaceId],
  ).map((row) => ({
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    userId: row.user_id as string,
    username: row.username as string,
    displayName: row.display_name as string,
    role: row.role as Role,
    joinedAt: row.joined_at as string,
  }));
}

export function inviteMember(workspaceId: string, ownerId: string, username: string, role: Role = 'editor') {
  assertCanEdit(workspaceId, ownerId);
  const ownerRole = getMemberRole(workspaceId, ownerId);
  if (ownerRole !== 'owner' && ownerRole !== 'editor') {
    throw new Error('Only owners/editors can invite');
  }
  if (role === 'owner') throw new Error('Cannot invite as owner');

  const count = memberCount(workspaceId);
  if (count >= MAX_TEAM_SIZE) {
    throw new Error(`Team size limit reached (max ${MAX_TEAM_SIZE} members)`);
  }

  const user = queryOne<Record<string, unknown>>('SELECT * FROM users WHERE username = ?', [username.trim()]);
  if (!user) throw new Error('User not found. They must create a local account first.');

  const existing = queryOne('SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?', [
    workspaceId,
    user.id,
  ]);
  if (existing) throw new Error('User is already a member');

  run(
    'INSERT INTO workspace_members (id, workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)',
    [uuid(), workspaceId, user.id, role, now()],
  );
  return listMembers(workspaceId);
}

export function updateMemberRole(workspaceId: string, actorId: string, memberUserId: string, role: Role) {
  const actorRole = assertMember(workspaceId, actorId);
  if (actorRole !== 'owner') throw new Error('Only owners can change roles');
  if (role === 'owner') throw new Error('Use transfer ownership instead');

  const target = queryOne<Record<string, unknown>>(
    'SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [workspaceId, memberUserId],
  );
  if (!target) throw new Error('Member not found');
  if (target.role === 'owner') throw new Error('Cannot change owner role');

  run('UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?', [
    role,
    workspaceId,
    memberUserId,
  ]);
  return listMembers(workspaceId);
}

export function removeMember(workspaceId: string, actorId: string, memberUserId: string) {
  const actorRole = assertMember(workspaceId, actorId);
  const target = queryOne<Record<string, unknown>>(
    'SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [workspaceId, memberUserId],
  );
  if (!target) throw new Error('Member not found');
  if (target.role === 'owner') throw new Error('Cannot remove the owner');
  if (actorRole !== 'owner' && actorId !== memberUserId) {
    throw new Error('Only owners can remove other members');
  }
  run('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?', [workspaceId, memberUserId]);
  return listMembers(workspaceId);
}

export function renameWorkspace(workspaceId: string, userId: string, name: string) {
  assertCanEdit(workspaceId, userId);
  run('UPDATE workspaces SET name = ? WHERE id = ?', [name.trim(), workspaceId]);
  return getWorkspace(workspaceId);
}

export function deleteWorkspace(workspaceId: string, userId: string) {
  const role = assertMember(workspaceId, userId);
  if (role !== 'owner') throw new Error('Only the owner can delete a workspace');
  run('DELETE FROM workspaces WHERE id = ?', [workspaceId]);
}

// --- Collections ---

export function listCollections(workspaceId: string): Collection[] {
  return queryAll<Record<string, unknown>>(
    'SELECT * FROM collections WHERE workspace_id = ? ORDER BY sort_order, name',
    [workspaceId],
  ).map((row) => ({
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    description: row.description as string,
    sortOrder: row.sort_order as number,
    createdAt: row.created_at as string,
  }));
}

export function createCollection(workspaceId: string, userId: string, name: string, description = ''): Collection {
  assertCanEdit(workspaceId, userId);
  const id = uuid();
  const createdAt = now();
  run(
    'INSERT INTO collections (id, workspace_id, name, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, workspaceId, name.trim(), description, 0, createdAt],
  );
  return { id, workspaceId, name: name.trim(), description, sortOrder: 0, createdAt };
}

export function renameCollection(collectionId: string, userId: string, name: string) {
  const col = queryOne<Record<string, unknown>>('SELECT * FROM collections WHERE id = ?', [collectionId]);
  if (!col) throw new Error('Collection not found');
  assertCanEdit(col.workspace_id as string, userId);
  run('UPDATE collections SET name = ? WHERE id = ?', [name.trim(), collectionId]);
}

export function deleteCollection(collectionId: string, userId: string) {
  const col = queryOne<Record<string, unknown>>('SELECT * FROM collections WHERE id = ?', [collectionId]);
  if (!col) throw new Error('Collection not found');
  assertCanEdit(col.workspace_id as string, userId);
  run('DELETE FROM collections WHERE id = ?', [collectionId]);
}

export function listFolders(collectionId: string): Folder[] {
  return queryAll<Record<string, unknown>>(
    'SELECT * FROM folders WHERE collection_id = ? ORDER BY sort_order, name',
    [collectionId],
  ).map((row) => ({
    id: row.id as string,
    collectionId: row.collection_id as string,
    parentId: (row.parent_id as string) || null,
    name: row.name as string,
    sortOrder: row.sort_order as number,
  }));
}

export function createFolder(collectionId: string, userId: string, name: string, parentId: string | null = null): Folder {
  const col = queryOne<Record<string, unknown>>('SELECT * FROM collections WHERE id = ?', [collectionId]);
  if (!col) throw new Error('Collection not found');
  assertCanEdit(col.workspace_id as string, userId);
  const id = uuid();
  run('INSERT INTO folders (id, collection_id, parent_id, name, sort_order) VALUES (?, ?, ?, ?, ?)', [
    id,
    collectionId,
    parentId,
    name.trim(),
    0,
  ]);
  return { id, collectionId, parentId, name: name.trim(), sortOrder: 0 };
}

export function deleteFolder(folderId: string, userId: string) {
  const folder = queryOne<Record<string, unknown>>('SELECT f.*, c.workspace_id FROM folders f JOIN collections c ON c.id = f.collection_id WHERE f.id = ?', [
    folderId,
  ]);
  if (!folder) throw new Error('Folder not found');
  assertCanEdit(folder.workspace_id as string, userId);
  run('DELETE FROM folders WHERE id = ?', [folderId]);
}

export function renameFolder(folderId: string, userId: string, name: string) {
  const folder = queryOne<Record<string, unknown>>(
    'SELECT f.*, c.workspace_id FROM folders f JOIN collections c ON c.id = f.collection_id WHERE f.id = ?',
    [folderId],
  );
  if (!folder) throw new Error('Folder not found');
  assertCanEdit(folder.workspace_id as string, userId);
  run('UPDATE folders SET name = ? WHERE id = ?', [name.trim(), folderId]);
}

export function duplicateCollection(collectionId: string, userId: string): Collection {
  const col = queryOne<Record<string, unknown>>('SELECT * FROM collections WHERE id = ?', [collectionId]);
  if (!col) throw new Error('Collection not found');
  assertCanEdit(col.workspace_id as string, userId);
  const created = createCollection(
    col.workspace_id as string,
    userId,
    `${col.name as string} Copy`,
    col.description as string,
  );
  const folders = listFolders(collectionId);
  const folderMap = new Map<string, string>();
  let pending = [...folders];
  let guard = 0;
  while (pending.length && guard++ < 100) {
    const next: Folder[] = [];
    for (const f of pending) {
      if (f.parentId && !folderMap.has(f.parentId)) {
        next.push(f);
        continue;
      }
      const parentId = f.parentId ? folderMap.get(f.parentId)! : null;
      const nf = createFolder(created.id, userId, f.name, parentId);
      folderMap.set(f.id, nf.id);
    }
    if (next.length === pending.length) {
      for (const f of next) {
        const nf = createFolder(created.id, userId, f.name, null);
        folderMap.set(f.id, nf.id);
      }
      break;
    }
    pending = next;
  }
  for (const r of listRequests(collectionId)) {
    saveRequest(userId, {
      collectionId: created.id,
      folderId: r.folderId ? folderMap.get(r.folderId) ?? null : null,
      name: r.name,
      method: r.method,
      url: r.url,
      params: r.params,
      headers: r.headers,
      auth: r.auth,
      body: r.body,
    });
  }
  return created;
}

function parseRequest(row: Record<string, unknown>): SavedRequest {
  return {
    id: row.id as string,
    collectionId: row.collection_id as string,
    folderId: (row.folder_id as string) || null,
    name: row.name as string,
    method: row.method as HttpMethod,
    url: row.url as string,
    params: JSON.parse(row.params_json as string) as KeyValue[],
    headers: JSON.parse(row.headers_json as string) as KeyValue[],
    auth: JSON.parse(row.auth_json as string) as AuthConfig,
    body: JSON.parse(row.body_json as string) as RequestBody,
    sortOrder: row.sort_order as number,
    updatedAt: row.updated_at as string,
  };
}

export function listRequests(collectionId: string): SavedRequest[] {
  return queryAll<Record<string, unknown>>(
    'SELECT * FROM requests WHERE collection_id = ? ORDER BY sort_order, name',
    [collectionId],
  ).map(parseRequest);
}

export function listRequestsByWorkspace(workspaceId: string): SavedRequest[] {
  return queryAll<Record<string, unknown>>(
    `SELECT r.* FROM requests r
     JOIN collections c ON c.id = r.collection_id
     WHERE c.workspace_id = ?
     ORDER BY r.sort_order, r.name`,
    [workspaceId],
  ).map(parseRequest);
}

export function getRequest(requestId: string): SavedRequest | null {
  const row = queryOne<Record<string, unknown>>('SELECT * FROM requests WHERE id = ?', [requestId]);
  return row ? parseRequest(row) : null;
}

export function saveRequest(
  userId: string,
  data: {
    id?: string;
    collectionId: string;
    folderId?: string | null;
    name: string;
    method: HttpMethod;
    url: string;
    params: KeyValue[];
    headers: KeyValue[];
    auth: AuthConfig;
    body: RequestBody;
  },
): SavedRequest {
  const col = queryOne<Record<string, unknown>>('SELECT * FROM collections WHERE id = ?', [data.collectionId]);
  if (!col) throw new Error('Collection not found');
  assertCanEdit(col.workspace_id as string, userId);

  const updatedAt = now();
  if (data.id) {
    run(
      `UPDATE requests SET folder_id=?, name=?, method=?, url=?, params_json=?, headers_json=?, auth_json=?, body_json=?, updated_at=?
       WHERE id=?`,
      [
        data.folderId ?? null,
        data.name.trim(),
        data.method,
        data.url,
        JSON.stringify(data.params),
        JSON.stringify(data.headers),
        JSON.stringify(data.auth),
        JSON.stringify(data.body),
        updatedAt,
        data.id,
      ],
    );
    return getRequest(data.id)!;
  }

  const id = uuid();
  run(
    `INSERT INTO requests (id, collection_id, folder_id, name, method, url, params_json, headers_json, auth_json, body_json, sort_order, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.collectionId,
      data.folderId ?? null,
      data.name.trim(),
      data.method,
      data.url,
      JSON.stringify(data.params),
      JSON.stringify(data.headers),
      JSON.stringify(data.auth),
      JSON.stringify(data.body),
      0,
      updatedAt,
    ],
  );
  return getRequest(id)!;
}

export function duplicateRequest(requestId: string, userId: string): SavedRequest {
  const req = getRequest(requestId);
  if (!req) throw new Error('Request not found');
  return saveRequest(userId, {
    collectionId: req.collectionId,
    folderId: req.folderId,
    name: `${req.name} Copy`,
    method: req.method,
    url: req.url,
    params: req.params,
    headers: req.headers,
    auth: req.auth,
    body: req.body,
  });
}

export function deleteRequest(requestId: string, userId: string) {
  const req = queryOne<Record<string, unknown>>(
    `SELECT r.*, c.workspace_id FROM requests r JOIN collections c ON c.id = r.collection_id WHERE r.id = ?`,
    [requestId],
  );
  if (!req) throw new Error('Request not found');
  assertCanEdit(req.workspace_id as string, userId);
  run('DELETE FROM requests WHERE id = ?', [requestId]);
}

// --- Environments ---

export function listEnvironments(workspaceId: string): Environment[] {
  return queryAll<Record<string, unknown>>(
    'SELECT * FROM environments WHERE workspace_id = ? ORDER BY name',
    [workspaceId],
  ).map((row) => ({
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    variables: JSON.parse(row.variables_json as string) as KeyValue[],
    createdAt: row.created_at as string,
  }));
}

export function createEnvironment(workspaceId: string, userId: string, name: string): Environment {
  assertCanEdit(workspaceId, userId);
  const id = uuid();
  const createdAt = now();
  run('INSERT INTO environments (id, workspace_id, name, variables_json, created_at) VALUES (?, ?, ?, ?, ?)', [
    id,
    workspaceId,
    name.trim(),
    '[]',
    createdAt,
  ]);
  return { id, workspaceId, name: name.trim(), variables: [], createdAt };
}

export function updateEnvironment(
  envId: string,
  userId: string,
  data: { name?: string; variables?: KeyValue[] },
): Environment {
  const env = queryOne<Record<string, unknown>>('SELECT * FROM environments WHERE id = ?', [envId]);
  if (!env) throw new Error('Environment not found');
  assertCanEdit(env.workspace_id as string, userId);
  const name = data.name?.trim() ?? (env.name as string);
  const variables = data.variables ?? JSON.parse(env.variables_json as string);
  run('UPDATE environments SET name = ?, variables_json = ? WHERE id = ?', [
    name,
    JSON.stringify(variables),
    envId,
  ]);
  return {
    id: envId,
    workspaceId: env.workspace_id as string,
    name,
    variables,
    createdAt: env.created_at as string,
  };
}

export function deleteEnvironment(envId: string, userId: string) {
  const env = queryOne<Record<string, unknown>>('SELECT * FROM environments WHERE id = ?', [envId]);
  if (!env) throw new Error('Environment not found');
  assertCanEdit(env.workspace_id as string, userId);
  run('DELETE FROM environments WHERE id = ?', [envId]);
}

export function setActiveEnvironment(workspaceId: string, userId: string, envId: string | null) {
  assertMember(workspaceId, userId);
  run(
    `INSERT INTO user_workspace_state (user_id, workspace_id, active_env_id) VALUES (?, ?, ?)
     ON CONFLICT(user_id, workspace_id) DO UPDATE SET active_env_id = excluded.active_env_id`,
    [userId, workspaceId, envId],
  );
}

export function getActiveEnvironmentId(workspaceId: string, userId: string): string | null {
  const row = queryOne<{ active_env_id: string | null }>(
    'SELECT active_env_id FROM user_workspace_state WHERE user_id = ? AND workspace_id = ?',
    [userId, workspaceId],
  );
  return row?.active_env_id ?? null;
}

// --- History ---

export function addHistory(
  workspaceId: string,
  userId: string,
  entry: {
    method: HttpMethod;
    url: string;
    status: number | null;
    durationMs: number | null;
    requestSnapshot: string;
    responseSnapshot: string | null;
  },
): HistoryEntry {
  assertMember(workspaceId, userId);
  const id = uuid();
  const createdAt = now();
  run(
    `INSERT INTO history (id, workspace_id, user_id, method, url, status, duration_ms, request_snapshot, response_snapshot, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      workspaceId,
      userId,
      entry.method,
      entry.url,
      entry.status,
      entry.durationMs,
      entry.requestSnapshot,
      entry.responseSnapshot,
      createdAt,
    ],
  );
  // Keep last 200
  run(
    `DELETE FROM history WHERE workspace_id = ? AND id NOT IN (
       SELECT id FROM history WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 200
     )`,
    [workspaceId, workspaceId],
  );
  return {
    id,
    workspaceId,
    userId,
    method: entry.method,
    url: entry.url,
    status: entry.status,
    durationMs: entry.durationMs,
    requestSnapshot: entry.requestSnapshot,
    responseSnapshot: entry.responseSnapshot,
    createdAt,
  };
}

export function listHistory(workspaceId: string, limit = 100): HistoryEntry[] {
  return queryAll<Record<string, unknown>>(
    'SELECT * FROM history WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?',
    [workspaceId, limit],
  ).map((row) => ({
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    userId: row.user_id as string,
    method: row.method as HttpMethod,
    url: row.url as string,
    status: row.status as number | null,
    durationMs: row.duration_ms as number | null,
    requestSnapshot: row.request_snapshot as string,
    responseSnapshot: row.response_snapshot as string | null,
    createdAt: row.created_at as string,
  }));
}

export function clearHistory(workspaceId: string, userId: string) {
  assertCanEdit(workspaceId, userId);
  run('DELETE FROM history WHERE workspace_id = ?', [workspaceId]);
}

// --- OpenAPI ---

export function saveOpenApiSpec(
  workspaceId: string,
  userId: string,
  name: string,
  content: string,
  version: string,
): OpenApiSpec {
  assertCanEdit(workspaceId, userId);
  const id = uuid();
  const createdAt = now();
  run(
    'INSERT INTO openapi_specs (id, workspace_id, name, content, version, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, workspaceId, name, content, version, createdAt],
  );
  return { id, workspaceId, name, content, version, createdAt };
}

export function listOpenApiSpecs(workspaceId: string): OpenApiSpec[] {
  return queryAll<Record<string, unknown>>(
    'SELECT * FROM openapi_specs WHERE workspace_id = ? ORDER BY created_at DESC',
    [workspaceId],
  ).map((row) => ({
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    content: row.content as string,
    version: row.version as string,
    createdAt: row.created_at as string,
  }));
}

export function getOpenApiSpec(specId: string): OpenApiSpec | null {
  const row = queryOne<Record<string, unknown>>('SELECT * FROM openapi_specs WHERE id = ?', [specId]);
  if (!row) return null;
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    content: row.content as string,
    version: row.version as string,
    createdAt: row.created_at as string,
  };
}

export function deleteOpenApiSpec(specId: string, userId: string) {
  const spec = getOpenApiSpec(specId);
  if (!spec) throw new Error('Spec not found');
  assertCanEdit(spec.workspaceId, userId);
  run('DELETE FROM openapi_specs WHERE id = ?', [specId]);
}

/** Low-level insert helpers for import (bypass edit checks; caller asserts) */
export function insertCollectionRaw(c: Collection) {
  run(
    'INSERT INTO collections (id, workspace_id, name, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [c.id, c.workspaceId, c.name, c.description, c.sortOrder, c.createdAt],
  );
}

export function insertFolderRaw(f: Folder) {
  run('INSERT INTO folders (id, collection_id, parent_id, name, sort_order) VALUES (?, ?, ?, ?, ?)', [
    f.id,
    f.collectionId,
    f.parentId,
    f.name,
    f.sortOrder,
  ]);
}

export function insertRequestRaw(r: SavedRequest) {
  run(
    `INSERT INTO requests (id, collection_id, folder_id, name, method, url, params_json, headers_json, auth_json, body_json, sort_order, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      r.id,
      r.collectionId,
      r.folderId,
      r.name,
      r.method,
      r.url,
      JSON.stringify(r.params),
      JSON.stringify(r.headers),
      JSON.stringify(r.auth),
      JSON.stringify(r.body),
      r.sortOrder,
      r.updatedAt,
    ],
  );
}

export function insertEnvironmentRaw(e: Environment) {
  run('INSERT INTO environments (id, workspace_id, name, variables_json, created_at) VALUES (?, ?, ?, ?, ?)', [
    e.id,
    e.workspaceId,
    e.name,
    JSON.stringify(e.variables),
    e.createdAt,
  ]);
}

export function findUserByUsername(username: string): User | null {
  const row = queryOne<Record<string, unknown>>('SELECT id, username, display_name, created_at FROM users WHERE username = ?', [
    username.trim(),
  ]);
  return row ? mapUser(row) : null;
}

export function ensureImportedUser(username: string): User {
  const existing = findUserByUsername(username);
  if (existing) return existing;
  // Stub member account — random password, must be reset/login not expected for stubs
  return registerUser(username, uuid().slice(0, 12), `${username} (imported)`);
}

export { saveDb, db as getDb };
