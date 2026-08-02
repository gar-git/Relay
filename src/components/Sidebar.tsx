import { useState } from 'react';
import type {
  Collection,
  Folder,
  HistoryEntry,
  SavedRequest,
} from '../lib/types';
import { METHOD_COLORS } from '../lib/utils';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';

export type TreeAction =
  | { type: 'add-request'; collectionId: string; folderId: string | null }
  | { type: 'add-folder'; collectionId: string; parentId: string | null }
  | { type: 'rename-collection'; id: string; name: string }
  | { type: 'duplicate-collection'; id: string }
  | { type: 'export-collection'; id: string }
  | { type: 'delete-collection'; id: string }
  | { type: 'rename-folder'; id: string; name: string }
  | { type: 'delete-folder'; id: string }
  | { type: 'rename-request'; id: string; name: string }
  | { type: 'duplicate-request'; id: string }
  | { type: 'delete-request'; id: string };

interface TreeProps {
  collections: Collection[];
  foldersByCollection: Record<string, Folder[]>;
  requestsByCollection: Record<string, SavedRequest[]>;
  activeRequestId: string | null;
  canEdit: boolean;
  onSelectRequest: (r: SavedRequest) => void;
  onCreateCollection: () => void;
  onAction: (action: TreeAction) => void;
}

type MenuState =
  | { kind: 'collection'; id: string; name: string; x: number; y: number }
  | { kind: 'folder'; id: string; collectionId: string; name: string; x: number; y: number }
  | { kind: 'request'; id: string; name: string; x: number; y: number };

export function CollectionTree(props: TreeProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function isExpanded(id: string) {
    return expanded[id] !== false;
  }

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !isExpanded(id) }));
  }

  function openMenu(e: React.MouseEvent, next: MenuState) {
    e.preventDefault();
    e.stopPropagation();
    setMenu(next);
  }

  function menuItems(): ContextMenuItem[] {
    if (!menu) return [];
    if (menu.kind === 'collection') {
      return [
        { id: 'add-request', label: 'Add request', disabled: !props.canEdit },
        { id: 'add-folder', label: 'Add folder', disabled: !props.canEdit },
        { id: 'export', label: 'Export', separatorBefore: true },
        { id: 'rename', label: 'Rename', separatorBefore: true, disabled: !props.canEdit, shortcut: 'Ctrl+E' },
        { id: 'duplicate', label: 'Duplicate', disabled: !props.canEdit, shortcut: 'Ctrl+D' },
        { id: 'delete', label: 'Delete', danger: true, disabled: !props.canEdit, shortcut: 'Del' },
      ];
    }
    if (menu.kind === 'folder') {
      return [
        { id: 'add-request', label: 'Add request', disabled: !props.canEdit },
        { id: 'add-folder', label: 'Add folder', disabled: !props.canEdit },
        { id: 'rename', label: 'Rename', separatorBefore: true, disabled: !props.canEdit },
        { id: 'delete', label: 'Delete', danger: true, disabled: !props.canEdit },
      ];
    }
    return [
      { id: 'rename', label: 'Rename', disabled: !props.canEdit },
      { id: 'duplicate', label: 'Duplicate', disabled: !props.canEdit, shortcut: 'Ctrl+D' },
      { id: 'delete', label: 'Delete', danger: true, disabled: !props.canEdit, shortcut: 'Del', separatorBefore: true },
    ];
  }

  function onMenuSelect(id: string) {
    if (!menu) return;
    if (menu.kind === 'collection') {
      if (id === 'add-request') props.onAction({ type: 'add-request', collectionId: menu.id, folderId: null });
      if (id === 'add-folder') props.onAction({ type: 'add-folder', collectionId: menu.id, parentId: null });
      if (id === 'export') props.onAction({ type: 'export-collection', id: menu.id });
      if (id === 'rename') props.onAction({ type: 'rename-collection', id: menu.id, name: menu.name });
      if (id === 'duplicate') props.onAction({ type: 'duplicate-collection', id: menu.id });
      if (id === 'delete') props.onAction({ type: 'delete-collection', id: menu.id });
    } else if (menu.kind === 'folder') {
      if (id === 'add-request')
        props.onAction({ type: 'add-request', collectionId: menu.collectionId, folderId: menu.id });
      if (id === 'add-folder')
        props.onAction({ type: 'add-folder', collectionId: menu.collectionId, parentId: menu.id });
      if (id === 'rename') props.onAction({ type: 'rename-folder', id: menu.id, name: menu.name });
      if (id === 'delete') props.onAction({ type: 'delete-folder', id: menu.id });
    } else {
      if (id === 'rename') props.onAction({ type: 'rename-request', id: menu.id, name: menu.name });
      if (id === 'duplicate') props.onAction({ type: 'duplicate-request', id: menu.id });
      if (id === 'delete') props.onAction({ type: 'delete-request', id: menu.id });
    }
  }

  return (
    <div onContextMenu={(e) => e.preventDefault()}>
      <div className="section-title">
        Packs
        <span className="spacer" />
        {props.canEdit && (
          <button type="button" className="ghost" onClick={props.onCreateCollection} title="New pack">
            +
          </button>
        )}
      </div>
      {props.collections.length === 0 && (
        <div className="empty">No packs yet. Right-click after creating one for more actions.</div>
      )}
      {props.collections.map((c) => {
        const folders = props.foldersByCollection[c.id] || [];
        const requests = props.requestsByCollection[c.id] || [];
        const rootFolders = folders.filter((f) => !f.parentId);
        const rootRequests = requests.filter((r) => !r.folderId);
        const open = isExpanded(c.id);
        return (
          <div key={c.id} style={{ marginBottom: 4 }}>
            <div
              className="tree-item"
              style={{ fontWeight: 600, color: 'var(--text)' }}
              onClick={() => toggle(c.id)}
              onContextMenu={(e) => openMenu(e, { kind: 'collection', id: c.id, name: c.name, x: e.clientX, y: e.clientY })}
            >
              <span className="tree-chevron">{open ? '▾' : '▸'}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
              </span>
            </div>
            {open && (
              <div style={{ paddingLeft: 12 }}>
                {rootFolders.map((f) => (
                  <FolderNode
                    key={f.id}
                    folder={f}
                    folders={folders}
                    requests={requests}
                    activeRequestId={props.activeRequestId}
                    canEdit={props.canEdit}
                    expanded={expanded}
                    onToggle={toggle}
                    onSelectRequest={props.onSelectRequest}
                    onContextMenu={openMenu}
                  />
                ))}
                {rootRequests.map((r) => (
                  <RequestNode
                    key={r.id}
                    request={r}
                    active={props.activeRequestId === r.id}
                    onSelect={() => props.onSelectRequest(r)}
                    onContextMenu={(e) =>
                      openMenu(e, { kind: 'request', id: r.id, name: r.name, x: e.clientX, y: e.clientY })
                    }
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems()}
          onClose={() => setMenu(null)}
          onSelect={onMenuSelect}
        />
      )}
    </div>
  );
}

function FolderNode({
  folder,
  folders,
  requests,
  activeRequestId,
  canEdit,
  expanded,
  onToggle,
  onSelectRequest,
  onContextMenu,
}: {
  folder: Folder;
  folders: Folder[];
  requests: SavedRequest[];
  activeRequestId: string | null;
  canEdit: boolean;
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  onSelectRequest: (r: SavedRequest) => void;
  onContextMenu: (e: React.MouseEvent, next: MenuState) => void;
}) {
  const childFolders = folders.filter((f) => f.parentId === folder.id);
  const childRequests = requests.filter((r) => r.folderId === folder.id);
  const open = expanded[folder.id] !== false;
  void canEdit;

  return (
    <div>
      <div
        className="tree-item"
        onClick={() => onToggle(folder.id)}
        onContextMenu={(e) =>
          onContextMenu(e, {
            kind: 'folder',
            id: folder.id,
            collectionId: folder.collectionId,
            name: folder.name,
            x: e.clientX,
            y: e.clientY,
          })
        }
      >
        <span className="tree-chevron">{open ? '▾' : '▸'}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {folder.name}
        </span>
      </div>
      {open && (
        <div style={{ paddingLeft: 12 }}>
          {childFolders.map((f) => (
            <FolderNode
              key={f.id}
              folder={f}
              folders={folders}
              requests={requests}
              activeRequestId={activeRequestId}
              canEdit={canEdit}
              expanded={expanded}
              onToggle={onToggle}
              onSelectRequest={onSelectRequest}
              onContextMenu={onContextMenu}
            />
          ))}
          {childRequests.map((r) => (
            <RequestNode
              key={r.id}
              request={r}
              active={activeRequestId === r.id}
              onSelect={() => onSelectRequest(r)}
              onContextMenu={(e) =>
                onContextMenu(e, { kind: 'request', id: r.id, name: r.name, x: e.clientX, y: e.clientY })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestNode({
  request,
  active,
  onSelect,
  onContextMenu,
}: {
  request: SavedRequest;
  active: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`tree-item ${active ? 'active' : ''}`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      <span className="method-badge" style={{ color: METHOD_COLORS[request.method] }}>
        {request.method}
      </span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {request.name}
      </span>
    </div>
  );
}

interface HistoryProps {
  entries: HistoryEntry[];
  onSelect: (entry: HistoryEntry) => void;
  onClear: () => void;
  canEdit: boolean;
}

export function HistoryList({ entries, onSelect, onClear, canEdit }: HistoryProps) {
  return (
    <div>
      <div className="section-title">
        History
        <span className="spacer" />
        {canEdit && entries.length > 0 && (
          <button type="button" className="ghost" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      {entries.length === 0 && <div className="empty">No history yet</div>}
      {entries.map((e) => (
        <div key={e.id} className="tree-item" onClick={() => onSelect(e)}>
          <span className="method-badge" style={{ color: METHOD_COLORS[e.method] }}>
            {e.method}
          </span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {e.url}
          </span>
          <span className="muted" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
            {e.status ?? '—'}
          </span>
        </div>
      ))}
    </div>
  );
}
