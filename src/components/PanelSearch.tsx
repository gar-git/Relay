import { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  matchCount: number;
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
  placeholder?: string;
  /** Optional: focus when parent presses Ctrl/Cmd+F inside the panel */
  focusSignal?: number;
}

export function PanelSearch({
  value,
  onChange,
  matchCount,
  activeIndex,
  onPrev,
  onNext,
  placeholder = 'Search…',
  focusSignal = 0,
}: Props) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const expanded = open || Boolean(value.trim());

  useEffect(() => {
    if (focusSignal > 0) setOpen(true);
  }, [focusSignal]);

  useEffect(() => {
    if (expanded) {
      inputRef.current?.focus();
      if (focusSignal > 0) inputRef.current?.select();
    }
  }, [expanded, focusSignal]);

  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node) && !value.trim()) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [expanded, value]);

  return (
    <div className={`panel-search-slot${expanded ? ' is-open' : ''}`} ref={rootRef}>
      {!expanded ? (
        <button
          type="button"
          className="ghost panel-search-icon-btn"
          title="Search (Ctrl+F)"
          aria-label={placeholder}
          onClick={() => setOpen(true)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      ) : (
        <div className="panel-search panel-search-expanded" onClick={(e) => e.stopPropagation()}>
          <svg className="panel-search-glyph" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            className="panel-search-input"
            type="search"
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) onPrev();
                else onNext();
              }
              if (e.key === 'Escape') {
                onChange('');
                setOpen(false);
              }
            }}
            aria-label={placeholder}
          />
          <span className="panel-search-count" title={value.trim() ? `${matchCount} matches` : ''}>
            {value.trim() ? (matchCount === 0 ? '0/0' : `${activeIndex + 1}/${matchCount}`) : ''}
          </span>
          <button type="button" className="ghost panel-search-nav" onClick={onPrev} disabled={!matchCount} title="Previous (Shift+Enter)">
            ↑
          </button>
          <button type="button" className="ghost panel-search-nav" onClick={onNext} disabled={!matchCount} title="Next (Enter)">
            ↓
          </button>
          <button
            type="button"
            className="ghost panel-search-nav"
            title="Close"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
