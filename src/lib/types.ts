/** Shared types for Relay IPC */

export type Role = 'owner' | 'editor' | 'viewer';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey';

export type BodyType = 'none' | 'raw' | 'json' | 'formdata' | 'urlencoded';

export interface User {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  memberCount?: number;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  username: string;
  displayName: string;
  role: Role;
  joinedAt: string;
}

export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  secret?: boolean;
  description?: string;
  /** Used by form-data rows: text (default) or file upload */
  kind?: 'text' | 'file';
  filePath?: string;
  fileName?: string;
}

export interface AuthConfig {
  type: AuthType;
  bearerToken?: string;
  basicUsername?: string;
  basicPassword?: string;
  apiKeyKey?: string;
  apiKeyValue?: string;
  apiKeyIn?: 'header' | 'query';
}

export interface RequestBody {
  type: BodyType;
  raw?: string;
  formData?: KeyValue[];
  urlencoded?: KeyValue[];
}

export interface SavedRequest {
  id: string;
  collectionId: string;
  folderId: string | null;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  auth: AuthConfig;
  body: RequestBody;
  sortOrder: number;
  updatedAt: string;
}

export interface Folder {
  id: string;
  collectionId: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
}

export interface Collection {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  sortOrder: number;
  createdAt: string;
}

export interface Environment {
  id: string;
  workspaceId: string;
  name: string;
  variables: KeyValue[];
  createdAt: string;
}

export interface HistoryEntry {
  id: string;
  workspaceId: string;
  userId: string;
  method: HttpMethod;
  url: string;
  status: number | null;
  durationMs: number | null;
  requestSnapshot: string;
  responseSnapshot: string | null;
  createdAt: string;
}

export interface OpenApiSpec {
  id: string;
  workspaceId: string;
  name: string;
  content: string;
  version: string;
  createdAt: string;
}

export interface SendRequestPayload {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: string | null;
  /** When set, Electron builds a binary multipart body (supports file parts). */
  multipart?: {
    boundary: string;
    parts: Array<{
      name: string;
      kind: 'text' | 'file';
      value?: string;
      filePath?: string;
      fileName?: string;
    }>;
  };
  timeoutMs?: number;
}

export interface SendRequestResult {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  sizeBytes: number;
  error?: string;
}

export interface Session {
  user: User;
  token: string;
}

export const MAX_TEAM_SIZE = 15;
