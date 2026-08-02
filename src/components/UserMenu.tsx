import { useEffect, useRef, useState } from 'react';

interface Props {
  name: string;
  onLogout: () => void;
}

export function UserMenu({ name, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className={`user-menu-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title={name}
      >
        <span className="user-menu-avatar">{name.slice(0, 1).toUpperCase()}</span>
        <span className="user-menu-name">{name}</span>
        <span className="user-menu-caret">▾</span>
      </button>
      {open && (
        <div className="user-menu-dropdown">
          <div className="user-menu-label">{name}</div>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
