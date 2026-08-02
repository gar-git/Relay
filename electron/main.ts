import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import path from 'path';
import fs from 'fs';
import * as db from './db';
import * as openapi from './openapi';
import * as ie from './import-export';
import type { SendRequestPayload, SendRequestResult } from '../src/lib/types';

process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public');

let win: BrowserWindow | null = null;
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function resolveAppIcon(): string | undefined {
  const candidates = [
    path.join(process.cwd(), 'build', 'icon.png'),
    path.join(app.getAppPath(), 'build', 'icon.png'),
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(process.resourcesPath, 'build', 'icon.png'),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

async function createWindow() {
  const icon = resolveAppIcon();
  // Native Windows menu sits under the title — remove it and use in-app menu beside the logo.
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }

  const isMac = process.platform === 'darwin';
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 680,
    title: 'Relay',
    backgroundColor: '#0f1218',
    autoHideMenuBar: true,
    // Cursor / VS Code style: one title bar row with in-app menu + overlay window controls
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac
      ? {}
      : {
          titleBarOverlay: {
            color: '#151a23',
            symbolColor: '#e8edf5',
            height: 40,
          },
        }),
    ...(icon ? { icon } : {}),
    webPreferences: {
      // sandbox:true (default) is required for CJS preload `require('electron')` to work
      // when nodeIntegration is false — otherwise window.relay never gets exposed.
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    await win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    await win.loadFile(path.join(process.env.DIST!, 'index.html'));
  }
}

function wrap<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg);
  }
}

async function sendHttp(payload: SendRequestPayload): Promise<SendRequestResult> {
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), payload.timeoutMs ?? 30000);

    let body: BodyInit | undefined =
      payload.method === 'GET' || payload.method === 'HEAD' ? undefined : payload.body ?? undefined;

    if (payload.multipart && payload.method !== 'GET' && payload.method !== 'HEAD') {
      const buf = buildMultipartBody(payload.multipart);
      body = new Uint8Array(buf);
    }

    const res = await fetch(payload.url, {
      method: payload.method,
      headers: payload.headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const buf = Buffer.from(await res.arrayBuffer());
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });

    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers,
      body: buf.toString('utf8'),
      durationMs: Date.now() - started,
      sizeBytes: buf.byteLength,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      statusText: '',
      headers: {},
      body: '',
      durationMs: Date.now() - started,
      sizeBytes: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function guessMime(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.xml': 'application/xml',
    '.zip': 'application/zip',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
  };
  return map[ext] || 'application/octet-stream';
}

function buildMultipartBody(multipart: NonNullable<SendRequestPayload['multipart']>): Buffer {
  const chunks: Buffer[] = [];
  const boundary = multipart.boundary;
  for (const part of multipart.parts) {
    if (part.kind === 'file' && part.filePath) {
      if (!fs.existsSync(part.filePath)) {
        throw new Error(`File not found: ${part.filePath}`);
      }
      const fileName = part.fileName || path.basename(part.filePath);
      const fileBuf = fs.readFileSync(part.filePath);
      const header =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${part.name}"; filename="${fileName}"\r\n` +
        `Content-Type: ${guessMime(fileName)}\r\n\r\n`;
      chunks.push(Buffer.from(header, 'utf8'));
      chunks.push(fileBuf);
      chunks.push(Buffer.from('\r\n', 'utf8'));
    } else {
      const header =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${part.name}"\r\n\r\n` +
        `${part.value ?? ''}\r\n`;
      chunks.push(Buffer.from(header, 'utf8'));
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return Buffer.concat(chunks);
}

function registerIpc() {
  ipcMain.handle('auth:register', (_e, username: string, password: string, displayName?: string) =>
    wrap(() => {
      const user = db.registerUser(username, password, displayName);
      const { token } = db.loginUser(username, password);
      return { user, token };
    }),
  );

  ipcMain.handle('auth:login', (_e, username: string, password: string) =>
    wrap(() => db.loginUser(username, password)),
  );

  ipcMain.handle('auth:logout', (_e, token: string) => wrap(() => db.logoutUser(token)));

  ipcMain.handle('auth:me', (_e, token: string) => wrap(() => db.getUserByToken(token)));

  ipcMain.handle('users:list', () => wrap(() => db.listUsers()));

  ipcMain.handle('workspaces:list', (_e, token: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      return db.listWorkspaces(user.id);
    }),
  );

  ipcMain.handle('workspaces:create', (_e, token: string, name: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      return db.createWorkspace(name, user.id);
    }),
  );

  ipcMain.handle('workspaces:rename', (_e, token: string, workspaceId: string, name: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      return db.renameWorkspace(workspaceId, user.id, name);
    }),
  );

  ipcMain.handle('workspaces:delete', (_e, token: string, workspaceId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      db.deleteWorkspace(workspaceId, user.id);
    }),
  );

  ipcMain.handle('workspaces:members', (_e, token: string, workspaceId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      db.assertMember(workspaceId, user.id);
      return db.listMembers(workspaceId);
    }),
  );

  ipcMain.handle(
    'workspaces:invite',
    (_e, token: string, workspaceId: string, username: string, role: 'editor' | 'viewer') =>
      wrap(() => {
        const user = db.getUserByToken(token);
        if (!user) throw new Error('Unauthorized');
        return db.inviteMember(workspaceId, user.id, username, role);
      }),
  );

  ipcMain.handle(
    'workspaces:updateRole',
    (_e, token: string, workspaceId: string, memberUserId: string, role: 'editor' | 'viewer') =>
      wrap(() => {
        const user = db.getUserByToken(token);
        if (!user) throw new Error('Unauthorized');
        return db.updateMemberRole(workspaceId, user.id, memberUserId, role);
      }),
  );

  ipcMain.handle('workspaces:removeMember', (_e, token: string, workspaceId: string, memberUserId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      return db.removeMember(workspaceId, user.id, memberUserId);
    }),
  );

  ipcMain.handle('workspaces:myRole', (_e, token: string, workspaceId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      return db.getMemberRole(workspaceId, user.id);
    }),
  );

  ipcMain.handle('http:send', (_e, payload: SendRequestPayload) => sendHttp(payload));

  ipcMain.handle('collections:list', (_e, token: string, workspaceId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      db.assertMember(workspaceId, user.id);
      return db.listCollections(workspaceId);
    }),
  );

  ipcMain.handle('collections:create', (_e, token: string, workspaceId: string, name: string, description?: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      return db.createCollection(workspaceId, user.id, name, description);
    }),
  );

  ipcMain.handle('collections:rename', (_e, token: string, collectionId: string, name: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      db.renameCollection(collectionId, user.id, name);
    }),
  );

  ipcMain.handle('collections:delete', (_e, token: string, collectionId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      db.deleteCollection(collectionId, user.id);
    }),
  );

  ipcMain.handle('folders:list', (_e, token: string, collectionId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      return db.listFolders(collectionId);
    }),
  );

  ipcMain.handle(
    'folders:create',
    (_e, token: string, collectionId: string, name: string, parentId: string | null) =>
      wrap(() => {
        const user = db.getUserByToken(token);
        if (!user) throw new Error('Unauthorized');
        return db.createFolder(collectionId, user.id, name, parentId);
      }),
  );

  ipcMain.handle('folders:delete', (_e, token: string, folderId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      db.deleteFolder(folderId, user.id);
    }),
  );

  ipcMain.handle('folders:rename', (_e, token: string, folderId: string, name: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      db.renameFolder(folderId, user.id, name);
    }),
  );

  ipcMain.handle('collections:duplicate', (_e, token: string, collectionId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      return db.duplicateCollection(collectionId, user.id);
    }),
  );

  ipcMain.handle('requests:list', (_e, token: string, collectionId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      return db.listRequests(collectionId);
    }),
  );

  ipcMain.handle('requests:listByWorkspace', (_e, token: string, workspaceId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      db.assertMember(workspaceId, user.id);
      return db.listRequestsByWorkspace(workspaceId);
    }),
  );

  ipcMain.handle('requests:get', (_e, token: string, requestId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      return db.getRequest(requestId);
    }),
  );

  ipcMain.handle('requests:save', (_e, token: string, data: Parameters<typeof db.saveRequest>[1]) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      return db.saveRequest(user.id, data);
    }),
  );

  ipcMain.handle('requests:duplicate', (_e, token: string, requestId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      return db.duplicateRequest(requestId, user.id);
    }),
  );

  ipcMain.handle('requests:delete', (_e, token: string, requestId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      db.deleteRequest(requestId, user.id);
    }),
  );

  ipcMain.handle('environments:list', (_e, token: string, workspaceId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      db.assertMember(workspaceId, user.id);
      return db.listEnvironments(workspaceId);
    }),
  );

  ipcMain.handle('environments:create', (_e, token: string, workspaceId: string, name: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      return db.createEnvironment(workspaceId, user.id, name);
    }),
  );

  ipcMain.handle(
    'environments:update',
    (_e, token: string, envId: string, data: { name?: string; variables?: import('../src/lib/types').KeyValue[] }) =>
      wrap(() => {
        const user = db.getUserByToken(token);
        if (!user) throw new Error('Unauthorized');
        return db.updateEnvironment(envId, user.id, data);
      }),
  );

  ipcMain.handle('environments:delete', (_e, token: string, envId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      db.deleteEnvironment(envId, user.id);
    }),
  );

  ipcMain.handle('environments:setActive', (_e, token: string, workspaceId: string, envId: string | null) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      db.setActiveEnvironment(workspaceId, user.id, envId);
    }),
  );

  ipcMain.handle('environments:getActive', (_e, token: string, workspaceId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      return db.getActiveEnvironmentId(workspaceId, user.id);
    }),
  );

  ipcMain.handle(
    'history:add',
    (
      _e,
      token: string,
      workspaceId: string,
      entry: {
        method: import('../src/lib/types').HttpMethod;
        url: string;
        status: number | null;
        durationMs: number | null;
        requestSnapshot: string;
        responseSnapshot: string | null;
      },
    ) =>
      wrap(() => {
        const user = db.getUserByToken(token);
        if (!user) throw new Error('Unauthorized');
        return db.addHistory(workspaceId, user.id, entry);
      }),
  );

  ipcMain.handle('history:list', (_e, token: string, workspaceId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      db.assertMember(workspaceId, user.id);
      return db.listHistory(workspaceId);
    }),
  );

  ipcMain.handle('history:clear', (_e, token: string, workspaceId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      db.clearHistory(workspaceId, user.id);
    }),
  );

  ipcMain.handle('openapi:list', (_e, token: string, workspaceId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      db.assertMember(workspaceId, user.id);
      return db.listOpenApiSpecs(workspaceId);
    }),
  );

  ipcMain.handle('openapi:get', (_e, token: string, specId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      return db.getOpenApiSpec(specId);
    }),
  );

  ipcMain.handle('openapi:parse', (_e, content: string) => wrap(() => openapi.listEndpoints(content)));

  ipcMain.handle(
    'openapi:import',
    (_e, token: string, workspaceId: string, content: string, collectionName?: string) =>
      wrap(() => {
        const user = db.getUserByToken(token);
        if (!user) throw new Error('Unauthorized');
        return openapi.importOpenApiToCollection(workspaceId, user.id, content, collectionName);
      }),
  );

  ipcMain.handle('openapi:fetchUrl', async (_e, url: string) => {
    return openapi.fetchOpenApiFromUrl(url);
  });

  ipcMain.handle('openapi:delete', (_e, token: string, specId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      db.deleteOpenApiSpec(specId, user.id);
    }),
  );

  ipcMain.handle('export:workspace', (_e, token: string, workspaceId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      return ie.exportWorkspace(workspaceId, user.id);
    }),
  );

  ipcMain.handle('export:postman', (_e, token: string, collectionId: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      return ie.exportPostmanCollection(collectionId, user.id);
    }),
  );

  ipcMain.handle('import:content', (_e, token: string, workspaceId: string, content: string, nameHint?: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      return ie.detectAndImport(workspaceId, user.id, content, nameHint);
    }),
  );

  ipcMain.handle('import:relay', (_e, token: string, content: string, nameHint?: string) =>
    wrap(() => {
      const user = db.getUserByToken(token);
      if (!user) throw new Error('Unauthorized');
      const pkg = JSON.parse(content) as ie.RelayPackage;
      return ie.importRelayPackage(user.id, pkg, nameHint);
    }),
  );

  ipcMain.handle('dialog:saveFile', async (_e, defaultName: string, content: string) => {
    const result = await dialog.showSaveDialog(win!, {
      defaultPath: defaultName,
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'Relay', extensions: ['relay.json', 'json'] },
        { name: 'All', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePath) return null;
    fs.writeFileSync(result.filePath, content, 'utf8');
    return result.filePath;
  });

  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [
        { name: 'API Specs', extensions: ['json', 'yaml', 'yml', 'relay.json'] },
        { name: 'All', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    return { path: filePath, content: fs.readFileSync(filePath, 'utf8'), name: path.basename(filePath) };
  });

  ipcMain.handle('dialog:pickFile', async () => {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: 'All files', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    return { path: filePath, name: path.basename(filePath) };
  });

  ipcMain.handle('app:quit', () => {
    app.quit();
  });

  ipcMain.handle('app:minimize', () => {
    win?.minimize();
  });

  ipcMain.handle('app:toggleDevTools', () => {
    win?.webContents.toggleDevTools();
  });

  ipcMain.handle('app:about', async () => {
    await dialog.showMessageBox(win!, {
      type: 'info',
      title: 'About Relay',
      message: 'Relay',
      detail: 'Local-first API client\nVersion 1.0.0\nWorkspaces up to 15 members',
    });
  });
}

app.whenReady().then(async () => {
  // Fix sql.js wasm path when running via vite-plugin-electron
  const sqlJsPath = path.join(app.getAppPath(), 'node_modules', 'sql.js', 'dist');
  if (!fs.existsSync(path.join(sqlJsPath, 'sql-wasm.wasm'))) {
    // try relative from project root in dev
  }
  await db.initDb();
  registerIpc();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
