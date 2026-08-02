import { contextBridge, ipcRenderer } from 'electron';
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
  SendRequestPayload,
  SendRequestResult,
  User,
  Workspace,
  WorkspaceMember,
} from '../src/lib/types';

export interface RelayApi {
  auth: {
    register: (username: string, password: string, displayName?: string) => Promise<{ user: User; token: string }>;
    login: (username: string, password: string) => Promise<{ user: User; token: string }>;
    logout: (token: string) => Promise<void>;
    me: (token: string) => Promise<User | null>;
  };
  users: {
    list: () => Promise<User[]>;
  };
  workspaces: {
    list: (token: string) => Promise<Workspace[]>;
    create: (token: string, name: string) => Promise<Workspace>;
    rename: (token: string, workspaceId: string, name: string) => Promise<Workspace | null>;
    delete: (token: string, workspaceId: string) => Promise<void>;
    members: (token: string, workspaceId: string) => Promise<WorkspaceMember[]>;
    invite: (token: string, workspaceId: string, username: string, role: 'editor' | 'viewer') => Promise<WorkspaceMember[]>;
    updateRole: (token: string, workspaceId: string, memberUserId: string, role: 'editor' | 'viewer') => Promise<WorkspaceMember[]>;
    removeMember: (token: string, workspaceId: string, memberUserId: string) => Promise<WorkspaceMember[]>;
    myRole: (token: string, workspaceId: string) => Promise<Role | null>;
  };
  http: {
    send: (payload: SendRequestPayload) => Promise<SendRequestResult>;
  };
  collections: {
    list: (token: string, workspaceId: string) => Promise<Collection[]>;
    create: (token: string, workspaceId: string, name: string, description?: string) => Promise<Collection>;
    rename: (token: string, collectionId: string, name: string) => Promise<void>;
    delete: (token: string, collectionId: string) => Promise<void>;
    duplicate: (token: string, collectionId: string) => Promise<Collection>;
  };
  folders: {
    list: (token: string, collectionId: string) => Promise<Folder[]>;
    create: (token: string, collectionId: string, name: string, parentId?: string | null) => Promise<Folder>;
    delete: (token: string, folderId: string) => Promise<void>;
    rename: (token: string, folderId: string, name: string) => Promise<void>;
  };
  requests: {
    list: (token: string, collectionId: string) => Promise<SavedRequest[]>;
    listByWorkspace: (token: string, workspaceId: string) => Promise<SavedRequest[]>;
    get: (token: string, requestId: string) => Promise<SavedRequest | null>;
    save: (
      token: string,
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
    ) => Promise<SavedRequest>;
    duplicate: (token: string, requestId: string) => Promise<SavedRequest>;
    delete: (token: string, requestId: string) => Promise<void>;
  };
  environments: {
    list: (token: string, workspaceId: string) => Promise<Environment[]>;
    create: (token: string, workspaceId: string, name: string) => Promise<Environment>;
    update: (token: string, envId: string, data: { name?: string; variables?: KeyValue[] }) => Promise<Environment>;
    delete: (token: string, envId: string) => Promise<void>;
    setActive: (token: string, workspaceId: string, envId: string | null) => Promise<void>;
    getActive: (token: string, workspaceId: string) => Promise<string | null>;
  };
  history: {
    add: (
      token: string,
      workspaceId: string,
      entry: {
        method: HttpMethod;
        url: string;
        status: number | null;
        durationMs: number | null;
        requestSnapshot: string;
        responseSnapshot: string | null;
      },
    ) => Promise<HistoryEntry>;
    list: (token: string, workspaceId: string) => Promise<HistoryEntry[]>;
    clear: (token: string, workspaceId: string) => Promise<void>;
  };
  openapi: {
    list: (token: string, workspaceId: string) => Promise<OpenApiSpec[]>;
    get: (token: string, specId: string) => Promise<OpenApiSpec | null>;
    parse: (content: string) => Promise<{
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
    }>;
    import: (
      token: string,
      workspaceId: string,
      content: string,
      collectionName?: string,
    ) => Promise<{ collectionId: string; requestCount: number; specId: string }>;
    fetchUrl: (url: string) => Promise<string>;
    delete: (token: string, specId: string) => Promise<void>;
  };
  export: {
    workspace: (token: string, workspaceId: string) => Promise<unknown>;
    postman: (token: string, collectionId: string) => Promise<unknown>;
  };
  import: {
    content: (token: string, workspaceId: string, content: string, nameHint?: string) => Promise<unknown>;
    relay: (token: string, content: string, nameHint?: string) => Promise<Workspace>;
  };
  dialog: {
    saveFile: (defaultName: string, content: string) => Promise<string | null>;
    openFile: () => Promise<{ path: string; content: string; name: string } | null>;
    pickFile: () => Promise<{ path: string; name: string } | null>;
  };
  app: {
    quit: () => Promise<void>;
    minimize: () => Promise<void>;
    toggleDevTools: () => Promise<void>;
    about: () => Promise<void>;
  };
}

const api: RelayApi = {
  auth: {
    register: (u, p, d) => ipcRenderer.invoke('auth:register', u, p, d),
    login: (u, p) => ipcRenderer.invoke('auth:login', u, p),
    logout: (t) => ipcRenderer.invoke('auth:logout', t),
    me: (t) => ipcRenderer.invoke('auth:me', t),
  },
  users: {
    list: () => ipcRenderer.invoke('users:list'),
  },
  workspaces: {
    list: (t) => ipcRenderer.invoke('workspaces:list', t),
    create: (t, n) => ipcRenderer.invoke('workspaces:create', t, n),
    rename: (t, id, n) => ipcRenderer.invoke('workspaces:rename', t, id, n),
    delete: (t, id) => ipcRenderer.invoke('workspaces:delete', t, id),
    members: (t, id) => ipcRenderer.invoke('workspaces:members', t, id),
    invite: (t, id, u, r) => ipcRenderer.invoke('workspaces:invite', t, id, u, r),
    updateRole: (t, id, m, r) => ipcRenderer.invoke('workspaces:updateRole', t, id, m, r),
    removeMember: (t, id, m) => ipcRenderer.invoke('workspaces:removeMember', t, id, m),
    myRole: (t, id) => ipcRenderer.invoke('workspaces:myRole', t, id),
  },
  http: {
    send: (p) => ipcRenderer.invoke('http:send', p),
  },
  collections: {
    list: (t, w) => ipcRenderer.invoke('collections:list', t, w),
    create: (t, w, n, d) => ipcRenderer.invoke('collections:create', t, w, n, d),
    rename: (t, id, n) => ipcRenderer.invoke('collections:rename', t, id, n),
    delete: (t, id) => ipcRenderer.invoke('collections:delete', t, id),
    duplicate: (t, id) => ipcRenderer.invoke('collections:duplicate', t, id),
  },
  folders: {
    list: (t, c) => ipcRenderer.invoke('folders:list', t, c),
    create: (t, c, n, p) => ipcRenderer.invoke('folders:create', t, c, n, p ?? null),
    delete: (t, id) => ipcRenderer.invoke('folders:delete', t, id),
    rename: (t, id, n) => ipcRenderer.invoke('folders:rename', t, id, n),
  },
  requests: {
    list: (t, c) => ipcRenderer.invoke('requests:list', t, c),
    listByWorkspace: (t, w) => ipcRenderer.invoke('requests:listByWorkspace', t, w),
    get: (t, id) => ipcRenderer.invoke('requests:get', t, id),
    save: (t, d) => ipcRenderer.invoke('requests:save', t, d),
    duplicate: (t, id) => ipcRenderer.invoke('requests:duplicate', t, id),
    delete: (t, id) => ipcRenderer.invoke('requests:delete', t, id),
  },
  environments: {
    list: (t, w) => ipcRenderer.invoke('environments:list', t, w),
    create: (t, w, n) => ipcRenderer.invoke('environments:create', t, w, n),
    update: (t, id, d) => ipcRenderer.invoke('environments:update', t, id, d),
    delete: (t, id) => ipcRenderer.invoke('environments:delete', t, id),
    setActive: (t, w, e) => ipcRenderer.invoke('environments:setActive', t, w, e),
    getActive: (t, w) => ipcRenderer.invoke('environments:getActive', t, w),
  },
  history: {
    add: (t, w, e) => ipcRenderer.invoke('history:add', t, w, e),
    list: (t, w) => ipcRenderer.invoke('history:list', t, w),
    clear: (t, w) => ipcRenderer.invoke('history:clear', t, w),
  },
  openapi: {
    list: (t, w) => ipcRenderer.invoke('openapi:list', t, w),
    get: (t, id) => ipcRenderer.invoke('openapi:get', t, id),
    parse: (c) => ipcRenderer.invoke('openapi:parse', c),
    import: (t, w, c, n) => ipcRenderer.invoke('openapi:import', t, w, c, n),
    fetchUrl: (u) => ipcRenderer.invoke('openapi:fetchUrl', u),
    delete: (t, id) => ipcRenderer.invoke('openapi:delete', t, id),
  },
  export: {
    workspace: (t, w) => ipcRenderer.invoke('export:workspace', t, w),
    postman: (t, c) => ipcRenderer.invoke('export:postman', t, c),
  },
  import: {
    content: (t, w, c, n) => ipcRenderer.invoke('import:content', t, w, c, n),
    relay: (t, c, n) => ipcRenderer.invoke('import:relay', t, c, n),
  },
  dialog: {
    saveFile: (n, c) => ipcRenderer.invoke('dialog:saveFile', n, c),
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    pickFile: () => ipcRenderer.invoke('dialog:pickFile'),
  },
  app: {
    quit: () => ipcRenderer.invoke('app:quit'),
    minimize: () => ipcRenderer.invoke('app:minimize'),
    toggleDevTools: () => ipcRenderer.invoke('app:toggleDevTools'),
    about: () => ipcRenderer.invoke('app:about'),
  },
};

contextBridge.exposeInMainWorld('relay', api);
