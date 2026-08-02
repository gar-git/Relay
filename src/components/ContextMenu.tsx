import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
  separatorBefore?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [x, y, items]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  return (
    <div className="context-menu" ref={ref} style={{ left: pos.left, top: pos.top }} role="menu">
      {items.map((item) => (
        <div key={item.id}>
          {item.separatorBefore && <div className="context-menu-sep" />}
          <button
            type="button"
            className={`context-menu-item ${item.danger ? 'danger' : ''}`}
            disabled={item.disabled}
            role="menuitem"
            onClick={() => {
              if (item.disabled) return;
              onSelect(item.id);
              onClose();
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
          </button>
        </div>
      ))}
    </div>
  );
}
