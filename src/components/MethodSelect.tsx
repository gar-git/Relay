import { useEffect, useRef, useState } from 'react';
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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
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
      {open && (
        <div className="method-picker-menu" role="listbox">
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
        </div>
      )}
    </div>
  );
}
