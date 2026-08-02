import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AuthConfig,
  Collection,
  Environment,
  Folder,
  HistoryEntry,
  HttpMethod,
  KeyValue,
  RequestBody,
  Role,
  SavedRequest,
  SendRequestResult,
  User,
  Workspace,
} from './lib/types';
import { buildCurl, buildSendPayload, newKv, varsFromEnv } from './lib/utils';
import { LoginScreen } from './components/LoginScreen';
import { RequestBuilder } from './components/RequestBuilder';
import { ResponseViewer } from './components/ResponseViewer';
import { CollectionTree, HistoryList, type TreeAction } from './components/Sidebar';
import { DocsViewer } from './components/DocsViewer';
import { EnvironmentModal, TeamPanel } from './components/TeamPanel';
import { BrandLogo } from './components/BrandLogo';
import { ConfirmModal, PromptModal } from './components/PromptModal';
import { CurlModal } from './components/CurlModal';
import { AppMenuBar } from './components/AppMenuBar';
import { UserMenu } from './components/UserMenu';
import {
  SplitPane,
  usePersistedNumber,
  usePersistedString,
  type EditorLayout,
  type PaneOrder,
} from './components/SplitPane';
type SideTab = 'collections' | 'history';
type CenterTab = 'request' | 'docs';

type PromptKind =
  | { type: 'collection' }
  | { type: 'folder'; collectionId: string; parentId?: string | null }
  | { type: 'workspace' }
  | { type: 'save-request' }
  | { type: 'add-request'; collectionId: string; folderId: string | null }
  | { type: 'rename-collection'; id: string; name: string }
  | { type: 'rename-folder'; id: string; name: string }
  | { type: 'rename-request'; id: string; name: string };

type ConfirmKind =
  | { type: 'delete-collection'; id: string }
  | { type: 'delete-folder'; id: string }
  | { type: 'delete-request'; id: string }
  | { type: 'delete-workspace' };

function emptyDraft() {
  return {
    id: null as string | null,
    collectionId: null as string | null,
    folderId: null as string | null,
    name: 'Untitled request',
    method: 'GET' as HttpMethod,
    url: '',
    params: [newKv()],
    headers: [newKv('Content-Type', 'application/json')],
    auth: { type: 'none' } as AuthConfig,
    body: { type: 'none' } as RequestBody,
  };
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('relay_token'));
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);

  const [collections, setCollections] = useState<Collection[]>([]);
  const [foldersByCollection, setFoldersByCollection] = useState<Record<string, Folder[]>>({});
  const [requestsByCollection, setRequestsByCollection] = useState<Record<string, SavedRequest[]>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [activeEnvId, setActiveEnvId] = useState<string | null>(null);

  const [sideTab, setSideTab] = useState<SideTab>('collections');
  const [centerTab, setCenterTab] = useState<CenterTab>('request');
  const [draft, setDraft] = useState(emptyDraft);
  const [result, setResult] = useState<SendRequestResult | null>(null);
  const [sending, setSending] = useState(false);

  const [showTeam, setShowTeam] = useState(false);
  const [showEnv, setShowEnv] = useState(false);
  const [showCurl, setShowCurl] = useState(false);
  const [error, setError] = useState('');
  const [promptDialog, setPromptDialog] = useState<PromptKind | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmKind | null>(null);
  const [sidebarWidth, setSidebarWidth] = usePersistedNumber('relay_sidebar_w', 280);
  const [editorSideSize, setEditorSideSize] = usePersistedNumber('relay_editor_side', 520);
  const [editorStackSize, setEditorStackSize] = usePersistedNumber('relay_editor_stack', 360);
  const [editorLayout, setEditorLayout] = usePersistedString<EditorLayout>('relay_editor_layout', 'side');
  const [paneOrder, setPaneOrder] = usePersistedString<PaneOrder>('relay_pane_order', 'request-first');
  const canEdit = myRole === 'owner' || myRole === 'editor';
  const activeEnv = environments.find((e) => e.id === activeEnvId) || null;
  const variables = useMemo(() => varsFromEnv(activeEnv?.variables || []), [activeEnv]);

  const curlCommand = useMemo(
    () =>
      draft.url
        ? buildCurl({
            method: draft.method,
            url: draft.url,
            params: draft.params,
            headers: draft.headers,
            auth: draft.auth,
            body: draft.body,
            variables,
          })
        : '',
    [draft, variables],
  );

  const bootstrap = useCallback(async (t: string) => {
    const me = await window.relay.auth.me(t);
    if (!me) {
      localStorage.removeItem('relay_token');
      setToken(null);
      setUser(null);
      return;
    }
    setUser(me);
    const ws = await window.relay.workspaces.list(t);
    setWorkspaces(ws);
    if (ws.length === 0) {
      const created = await window.relay.workspaces.create(t, 'My Workspace');
      setWorkspaces([created]);
      setWorkspaceId(created.id);
    } else {
      setWorkspaceId((prev) => prev || ws[0].id);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    bootstrap(token).catch((e) => setError(String(e)));
  }, [token, bootstrap]);

  const refreshWorkspace = useCallback(async () => {
    if (!token || !workspaceId) return;
    const [cols, hist, envs, role, active] = await Promise.all([
      window.relay.collections.list(token, workspaceId),
      window.relay.history.list(token, workspaceId),
      window.relay.environments.list(token, workspaceId),
      window.relay.workspaces.myRole(token, workspaceId),
      window.relay.environments.getActive(token, workspaceId),
    ]);
    setCollections(cols);
    setHistory(hist);
    setEnvironments(envs);
    setMyRole(role);
    setActiveEnvId(active || envs[0]?.id || null);

    const foldersMap: Record<string, Folder[]> = {};
    const reqMap: Record<string, SavedRequest[]> = {};
    await Promise.all(
      cols.map(async (c: Collection) => {
        foldersMap[c.id] = await window.relay.folders.list(token, c.id);
        reqMap[c.id] = await window.relay.requests.list(token, c.id);
      }),
    );
    setFoldersByCollection(foldersMap);
    setRequestsByCollection(reqMap);
  }, [token, workspaceId]);

  useEffect(() => {
    refreshWorkspace().catch((e) => setError(String(e)));
  }, [refreshWorkspace]);

  async function logout() {
    if (token) await window.relay.auth.logout(token);
    localStorage.removeItem('relay_token');
    setToken(null);
    setUser(null);
  }

  function loadRequest(r: SavedRequest) {
    setDraft({
      id: r.id,
      collectionId: r.collectionId,
      folderId: r.folderId,
      name: r.name,
      method: r.method,
      url: r.url,
      params: r.params.length ? r.params : [newKv()],
      headers: r.headers.length ? r.headers : [newKv()],
      auth: r.auth,
      body: r.body,
    });
    setCenterTab('request');
    setResult(null);
  }

  async function send() {
    if (!token || !workspaceId) return;
    setSending(true);
    setError('');
    try {
      const payload = buildSendPayload({
        method: draft.method,
        url: draft.url,
        params: draft.params,
        headers: draft.headers,
        auth: draft.auth,
        body: draft.body,
        variables,
      });
      const res = await window.relay.http.send(payload);
      setResult(res);
      await window.relay.history.add(token, workspaceId, {
        method: draft.method,
        url: payload.url,
        status: res.error ? null : res.status,
        durationMs: res.durationMs,
        requestSnapshot: JSON.stringify(draft),
        responseSnapshot: JSON.stringify(res),
      });
      const hist = await window.relay.history.list(token, workspaceId);
      setHistory(hist);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function saveRequest() {
    if (!token || !canEdit) return;
    setPromptDialog({ type: 'save-request' });
  }

  async function handlePromptConfirm(value: string) {
    if (!token || !promptDialog) return;
    const kind = promptDialog;
    setPromptDialog(null);
    try {
      if (kind.type === 'collection') {
        if (!workspaceId) return;
        await window.relay.collections.create(token, workspaceId, value);
        await refreshWorkspace();
      } else if (kind.type === 'folder') {
        await window.relay.folders.create(token, kind.collectionId, value, kind.parentId ?? null);
        await refreshWorkspace();
      } else if (kind.type === 'workspace') {
        const ws = await window.relay.workspaces.create(token, value);
        const list = await window.relay.workspaces.list(token);
        setWorkspaces(list);
        setWorkspaceId(ws.id);
      } else if (kind.type === 'add-request') {
        const saved = await window.relay.requests.save(token, {
          collectionId: kind.collectionId,
          folderId: kind.folderId,
          name: value,
          method: 'GET',
          url: '',
          params: [newKv()],
          headers: [newKv('Content-Type', 'application/json')],
          auth: { type: 'none' },
          body: { type: 'none' },
        });
        loadRequest(saved);
        setCenterTab('request');
        await refreshWorkspace();
      } else if (kind.type === 'rename-collection') {
        await window.relay.collections.rename(token, kind.id, value);
        await refreshWorkspace();
      } else if (kind.type === 'rename-folder') {
        await window.relay.folders.rename(token, kind.id, value);
        await refreshWorkspace();
      } else if (kind.type === 'rename-request') {
        const existing = await window.relay.requests.get(token, kind.id);
        if (!existing) return;
        const saved = await window.relay.requests.save(token, {
          id: existing.id,
          collectionId: existing.collectionId,
          folderId: existing.folderId,
          name: value,
          method: existing.method,
          url: existing.url,
          params: existing.params,
          headers: existing.headers,
          auth: existing.auth,
          body: existing.body,
        });
        if (draft.id === saved.id) setDraft((d) => ({ ...d, name: saved.name }));
        await refreshWorkspace();
      } else if (kind.type === 'save-request') {
        let collectionId = draft.collectionId;
        if (!collectionId) {
          if (collections[0]) collectionId = collections[0].id;
          else {
            const col = await window.relay.collections.create(token, workspaceId!, 'Default Pack');
            collectionId = col.id;
          }
        }
        const saved = await window.relay.requests.save(token, {
          id: draft.id || undefined,
          collectionId,
          folderId: draft.folderId,
          name: value,
          method: draft.method,
          url: draft.url,
          params: draft.params,
          headers: draft.headers,
          auth: draft.auth,
          body: draft.body,
        });
        setDraft((d) => ({ ...d, id: saved.id, collectionId: saved.collectionId, name: saved.name }));
        await refreshWorkspace();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleConfirm() {
    if (!token || !confirmDialog) return;
    const kind = confirmDialog;
    setConfirmDialog(null);
    try {
      if (kind.type === 'delete-collection') {
        await window.relay.collections.delete(token, kind.id);
        await refreshWorkspace();
      } else if (kind.type === 'delete-folder') {
        await window.relay.folders.delete(token, kind.id);
        await refreshWorkspace();
      } else if (kind.type === 'delete-request') {
        await window.relay.requests.delete(token, kind.id);
        if (draft.id === kind.id) setDraft(emptyDraft());
        await refreshWorkspace();
      } else if (kind.type === 'delete-workspace' && workspaceId) {
        await window.relay.workspaces.delete(token, workspaceId);
        let list = await window.relay.workspaces.list(token);
        if (list.length === 0) {
          const created = await window.relay.workspaces.create(token, 'My Workspace');
          list = [created];
        }
        setWorkspaces(list);
        setWorkspaceId(list[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleTreeAction(action: TreeAction) {
    if (!token) return;
    try {
      switch (action.type) {
        case 'add-request':
          setPromptDialog({
            type: 'add-request',
            collectionId: action.collectionId,
            folderId: action.folderId,
          });
          break;
        case 'add-folder':
          setPromptDialog({
            type: 'folder',
            collectionId: action.collectionId,
            parentId: action.parentId,
          });
          break;
        case 'rename-collection':
          setPromptDialog({ type: 'rename-collection', id: action.id, name: action.name });
          break;
        case 'rename-folder':
          setPromptDialog({ type: 'rename-folder', id: action.id, name: action.name });
          break;
        case 'rename-request':
          setPromptDialog({ type: 'rename-request', id: action.id, name: action.name });
          break;
        case 'duplicate-collection':
          await window.relay.collections.duplicate(token, action.id);
          await refreshWorkspace();
          break;
        case 'duplicate-request':
          await window.relay.requests.duplicate(token, action.id);
          await refreshWorkspace();
          break;
        case 'export-collection': {
          const data = await window.relay.export.postman(token, action.id);
          const col = collections.find((c) => c.id === action.id);
          await window.relay.dialog.saveFile(
            `${col?.name || 'pack'}.postman_collection.json`,
            JSON.stringify(data, null, 2),
          );
          break;
        }
        case 'delete-collection':
          setConfirmDialog({ type: 'delete-collection', id: action.id });
          break;
        case 'delete-folder':
          setConfirmDialog({ type: 'delete-folder', id: action.id });
          break;
        case 'delete-request':
          setConfirmDialog({ type: 'delete-request', id: action.id });
          break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function exportWorkspace() {
    if (!token || !workspaceId) return;
    const pkg = await window.relay.export.workspace(token, workspaceId);
    const ws = workspaces.find((w) => w.id === workspaceId);
    await window.relay.dialog.saveFile(`${ws?.name || 'workspace'}.relay.json`, JSON.stringify(pkg, null, 2));
  }

  async function importAnything() {
    if (!token || !workspaceId) return;
    const file = await window.relay.dialog.openFile();
    if (!file) return;
    try {
      const result = await window.relay.import.content(token, workspaceId, file.content, file.name);
      if ((result as { type: string }).type === 'relay') {
        await bootstrap(token);
      }
      await refreshWorkspace();
    } catch (e) {
      // maybe full relay package without current workspace context
      try {
        await window.relay.import.relay(token, file.content);
        await bootstrap(token);
        await refreshWorkspace();
      } catch (e2) {
        setError(e instanceof Error ? e.message : String(e2));
      }
    }
  }

  if (!token || !user) {
    return <LoginScreen onAuth={(t) => setToken(t)} />;
  }

  const currentWs = workspaces.find((w) => w.id === workspaceId);

  return (
    <div className="app-shell">
      <header className="chrome">
        <div className="titlebar">
          <div className="titlebar-left no-drag">
            <BrandLogo size={18} showWordmark={false} />
            <AppMenuBar
              handlers={{
                onImport: importAnything,
                onExport: exportWorkspace,
                onNewWorkspace: () => setPromptDialog({ type: 'workspace' }),
                onManageEnv: () => setShowEnv(true),
                onTeam: () => setShowTeam(true),
                onToggleDocs: () => setCenterTab((t) => (t === 'docs' ? 'request' : 'docs')),
              }}
            />
          </div>
          <div className="titlebar-center" aria-hidden="true">
            Relay
          </div>
          <div className="titlebar-beside-title no-drag">
            <UserMenu name={user.displayName || user.username} onLogout={logout} />
          </div>
        </div>
        <div className="toolbar no-drag">
          <div className="toolbar-left">
            <select
              value={workspaceId || ''}
              onChange={(e) => setWorkspaceId(e.target.value)}
              style={{ minWidth: 140 }}
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.memberCount ?? '?'}/15)
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setPromptDialog({ type: 'workspace' })}>
              New workspace
            </button>
            <button type="button" onClick={() => setShowTeam(true)}>
              Team
            </button>
            {myRole === 'owner' && workspaceId && (
              <button
                type="button"
                className="ghost danger"
                title="Delete workspace"
                onClick={() => setConfirmDialog({ type: 'delete-workspace' })}
              >
                Delete WS
              </button>
            )}
            <button type="button" onClick={importAnything}>
              Import
            </button>
            <button type="button" onClick={exportWorkspace}>
              Export
            </button>
          </div>
          <div className="toolbar-right">
            <select
              value={activeEnvId || ''}
              onChange={async (e) => {
                const id = e.target.value || null;
                setActiveEnvId(id);
                if (token && workspaceId) await window.relay.environments.setActive(token, workspaceId, id);
              }}
              title="Active environment"
              className="toolbar-env-select"
            >
              <option value="">No environment</option>
              {environments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setShowEnv(true)} title="Manage environments">
              Env
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div style={{ padding: '6px 12px', background: 'var(--err-bg)', color: 'var(--err)', borderBottom: '1px solid var(--border)' }}>
          {error}
          <button type="button" className="ghost" style={{ marginLeft: 8 }} onClick={() => setError('')}>
            dismiss
          </button>
        </div>
      )}

      <div className="main-grid">
        <SplitPane
          direction="horizontal"
          size={sidebarWidth}
          onSizeChange={setSidebarWidth}
          minFirst={180}
          minSecond={420}
          first={
        <aside className="sidebar">
          <div className="sidebar-tabs">
            <button type="button" className={sideTab === 'collections' ? 'active' : ''} onClick={() => setSideTab('collections')}>
              Packs
            </button>
            <button type="button" className={sideTab === 'history' ? 'active' : ''} onClick={() => setSideTab('history')}>
              History
            </button>
          </div>
          <div className="sidebar-body">
            {sideTab === 'collections' ? (
              <CollectionTree
                collections={collections}
                foldersByCollection={foldersByCollection}
                requestsByCollection={requestsByCollection}
                activeRequestId={draft.id}
                canEdit={canEdit}
                onSelectRequest={loadRequest}
                onCreateCollection={() => setPromptDialog({ type: 'collection' })}
                onAction={handleTreeAction}
              />
            ) : (
              <HistoryList
                entries={history}
                canEdit={canEdit}
                onClear={async () => {
                  if (!token || !workspaceId) return;
                  await window.relay.history.clear(token, workspaceId);
                  setHistory([]);
                }}
                onSelect={(entry) => {
                  try {
                    const snap = JSON.parse(entry.requestSnapshot);
                    setDraft({
                      id: snap.id || null,
                      collectionId: snap.collectionId || null,
                      folderId: snap.folderId || null,
                      name: snap.name || 'From history',
                      method: snap.method,
                      url: snap.url,
                      params: snap.params || [newKv()],
                      headers: snap.headers || [newKv()],
                      auth: snap.auth || { type: 'none' },
                      body: snap.body || { type: 'none' },
                    });
                    if (entry.responseSnapshot) {
                      setResult(JSON.parse(entry.responseSnapshot));
                    }
                    setCenterTab('request');
                  } catch {
                    setDraft({
                      ...emptyDraft(),
                      method: entry.method,
                      url: entry.url,
                    });
                  }
                }}
              />
            )}
          </div>
        </aside>
          }
          second={
        <div className="workspace-area">
          <div className="row" style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', gap: 10 }}>
            <div className="panel-tabs" style={{ border: 'none', padding: 0, background: 'transparent' }}>
              <button type="button" className={centerTab === 'request' ? 'active' : ''} onClick={() => setCenterTab('request')}>
                Request
              </button>
              <button type="button" className={centerTab === 'docs' ? 'active' : ''} onClick={() => setCenterTab('docs')}>
                Docs / Swagger
              </button>
            </div>
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              style={{ width: 200 }}
              disabled={!canEdit}
            />
            <button type="button" onClick={() => setDraft(emptyDraft())}>
              New
            </button>
            {canEdit && (
              <button type="button" className="primary" onClick={saveRequest}>
                Save
              </button>
            )}
            {centerTab === 'request' && (
              <div className="layout-controls" title="Panel layout">
                <button
                  type="button"
                  className={editorLayout === 'side' ? 'active' : ''}
                  onClick={() => setEditorLayout('side')}
                  title="Side by side"
                >
                  ▥
                </button>
                <button
                  type="button"
                  className={editorLayout === 'stack' ? 'active' : ''}
                  onClick={() => setEditorLayout('stack')}
                  title="Stacked"
                >
                  ☰
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPaneOrder((o) => (o === 'request-first' ? 'response-first' : 'request-first'))
                  }
                  title="Swap request / response order"
                >
                  ⇄
                </button>
              </div>
            )}
            <span className="spacer" />
            <span className="muted">{currentWs?.name}</span>
            <span className="chip">{myRole}</span>
          </div>

          {centerTab === 'docs' ? (
            <DocsViewer
              token={token}
              workspaceId={workspaceId!}
              canEdit={canEdit}
              onImported={refreshWorkspace}
              onTry={(data) => {
                setDraft({
                  ...emptyDraft(),
                  name: data.name,
                  method: data.method,
                  url: data.url,
                  params: data.params.length ? data.params : [newKv()],
                  headers: data.headers.length ? data.headers : [newKv()],
                  auth: data.auth,
                  body: data.body,
                });
                setCenterTab('request');
              }}
            />
          ) : (
            <SplitPane
              direction={editorLayout === 'side' ? 'horizontal' : 'vertical'}
              size={editorLayout === 'side' ? editorSideSize : editorStackSize}
              onSizeChange={editorLayout === 'side' ? setEditorSideSize : setEditorStackSize}
              minFirst={320}
              minSecond={180}
              reversed={paneOrder === 'response-first'}
              first={
                <RequestBuilder
                  method={draft.method}
                  url={draft.url}
                  params={draft.params}
                  headers={draft.headers}
                  auth={draft.auth}
                  body={draft.body}
                  readOnly={!canEdit && false}
                  sending={sending}
                  onMethod={(method) => setDraft((d) => ({ ...d, method }))}
                  onUrl={(url) => setDraft((d) => ({ ...d, url }))}
                  onParams={(params) => setDraft((d) => ({ ...d, params }))}
                  onHeaders={(headers) => setDraft((d) => ({ ...d, headers }))}
                  onAuth={(auth) => setDraft((d) => ({ ...d, auth }))}
                  onBody={(body) => setDraft((d) => ({ ...d, body }))}
                  onSend={send}
                  onShowCurl={() => setShowCurl(true)}
                />
              }
              second={<ResponseViewer result={result} loading={sending} />}
            />
          )}
        </div>
          }
        />
      </div>

      {showTeam && workspaceId && (
        <TeamPanel token={token} workspaceId={workspaceId} myRole={myRole} onClose={() => setShowTeam(false)} />
      )}
      {showEnv && workspaceId && (
        <EnvironmentModal
          token={token}
          workspaceId={workspaceId}
          environments={environments}
          activeEnvId={activeEnvId}
          canEdit={canEdit}
          onClose={() => setShowEnv(false)}
          onChange={async () => {
            await refreshWorkspace();
          }}
        />
      )}
      <CurlModal open={showCurl} curl={curlCommand} onClose={() => setShowCurl(false)} />
      <PromptModal
        open={!!promptDialog}
        title={
          promptDialog?.type === 'collection'
            ? 'New pack'
            : promptDialog?.type === 'folder'
              ? 'New folder'
              : promptDialog?.type === 'workspace'
                ? 'New workspace'
                : promptDialog?.type === 'add-request'
                  ? 'New request'
                  : promptDialog?.type === 'rename-collection'
                    ? 'Rename pack'
                    : promptDialog?.type === 'rename-folder'
                      ? 'Rename folder'
                      : promptDialog?.type === 'rename-request'
                        ? 'Rename request'
                        : 'Save request'
        }
        defaultValue={
          promptDialog?.type === 'save-request'
            ? draft.name
            : promptDialog?.type === 'rename-collection' ||
                promptDialog?.type === 'rename-folder' ||
                promptDialog?.type === 'rename-request'
              ? promptDialog.name
              : promptDialog?.type === 'add-request'
                ? 'New Request'
                : ''
        }
        confirmLabel={
          promptDialog?.type === 'save-request'
            ? 'Save'
            : promptDialog?.type?.startsWith('rename')
              ? 'Rename'
              : 'Create'
        }
        onCancel={() => setPromptDialog(null)}
        onConfirm={handlePromptConfirm}
      />
      <ConfirmModal
        open={!!confirmDialog}
        title={
          confirmDialog?.type === 'delete-workspace'
            ? 'Delete workspace'
            : confirmDialog?.type === 'delete-folder'
              ? 'Delete folder'
              : confirmDialog?.type === 'delete-request'
                ? 'Delete request'
                : 'Delete pack'
        }
        message={
          confirmDialog?.type === 'delete-workspace'
            ? `Delete workspace "${currentWs?.name}"? This cannot be undone.`
            : confirmDialog?.type === 'delete-folder'
              ? 'Delete this folder? Requests inside it will move to the pack root.'
              : confirmDialog?.type === 'delete-request'
                ? 'Delete this request?'
                : 'Delete this pack and all of its requests?'
        }
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDialog(null)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
