import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HttpMethod } from '../lib/types';
import { METHOD_COLORS } from '../lib/utils';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

interface Props {
  value: HttpMethod;
  onChange: (method: HttpMethod) => void;
  disabled?: boolean;
}

export function MethodSelect({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, minWidth: 120 });
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const update = () => {
      const rect = rootRef.current!.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        left: rect.left,
        minWidth: Math.max(120, rect.width),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`method-picker ${open ? 'open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="method-picker-trigger"
        disabled={disabled}
        style={{ color: METHOD_COLORS[value] }}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{value}</span>
        <span className="method-picker-caret">▾</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="method-picker-menu method-picker-menu-portal"
            role="listbox"
            style={{ top: menuPos.top, left: menuPos.left, minWidth: menuPos.minWidth }}
          >
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                role="option"
                aria-selected={m === value}
                className={`method-picker-option ${m === value ? 'active' : ''}`}
                style={{ color: METHOD_COLORS[m] }}
                onClick={() => {
                  onChange(m);
                  setOpen(false);
                }}
              >
                {m}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
