import { useEffect, useRef, useState } from 'react';

export interface AppMenuActionHandlers {
  onImport: () => void;
  onExport: () => void;
  onNewWorkspace: () => void;
  onManageEnv: () => void;
  onTeam: () => void;
  onToggleDocs: () => void;
}

interface Props {
  handlers: AppMenuActionHandlers;
}

type MenuKey = 'file' | 'edit' | 'view' | 'window' | 'help' | null;

interface Item {
  label: string;
  action?: keyof AppMenuActionHandlers | 'quit' | 'minimize' | 'devtools' | 'about';
  separator?: boolean;
}

const MENUS: { key: Exclude<MenuKey, null>; label: string; items: Item[] }[] = [
  {
    key: 'file',
    label: 'File',
    items: [
      { label: 'Import…', action: 'onImport' },
      { label: 'Export workspace…', action: 'onExport' },
      { separator: true, label: '' },
      { label: 'New workspace…', action: 'onNewWorkspace' },
      { separator: true, label: '' },
      { label: 'Quit', action: 'quit' },
    ],
  },
  {
    key: 'edit',
    label: 'Edit',
    items: [
      { label: 'Manage environments…', action: 'onManageEnv' },
      { label: 'Team…', action: 'onTeam' },
    ],
  },
  {
    key: 'view',
    label: 'View',
    items: [
      { label: 'Toggle Docs / Request', action: 'onToggleDocs' },
      { separator: true, label: '' },
      { label: 'Toggle DevTools', action: 'devtools' },
    ],
  },
  {
    key: 'window',
    label: 'Window',
    items: [{ label: 'Minimize', action: 'minimize' }],
  },
  {
    key: 'help',
    label: 'Help',
    items: [{ label: 'About Relay', action: 'about' }],
  },
];

export function AppMenuBar({ handlers }: Props) {
  const [open, setOpen] = useState<MenuKey>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  async function run(action?: Item['action']) {
    setOpen(null);
    if (!action) return;
    if (action === 'quit') {
      await window.relay.app.quit();
      return;
    }
    if (action === 'minimize') {
      await window.relay.app.minimize();
      return;
    }
    if (action === 'devtools') {
      await window.relay.app.toggleDevTools();
      return;
    }
    if (action === 'about') {
      await window.relay.app.about();
      return;
    }
    handlers[action]();
  }

  return (
    <div className="app-menu-bar" ref={rootRef}>
      {MENUS.map((menu) => (
        <div key={menu.key} className="app-menu">
          <button
            type="button"
            className={`app-menu-trigger ${open === menu.key ? 'open' : ''}`}
            onClick={() => setOpen((o) => (o === menu.key ? null : menu.key))}
            onMouseEnter={() => {
              if (open) setOpen(menu.key);
            }}
          >
            {menu.label}
          </button>
          {open === menu.key && (
            <div className="app-menu-dropdown">
              {menu.items.map((item, i) =>
                item.separator ? (
                  <div key={`sep-${i}`} className="context-menu-sep" />
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    className="context-menu-item"
                    onClick={() => run(item.action)}
                  >
                    {item.label}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
