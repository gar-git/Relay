import { useCallback, useEffect, useRef, useState } from 'react';

export type SplitDirection = 'horizontal' | 'vertical';

interface Props {
  direction: SplitDirection;
  first: React.ReactNode;
  second: React.ReactNode;
  /** Size of the first pane in px (horizontal = width, vertical = height) */
  size: number;
  onSizeChange: (size: number) => void;
  minFirst?: number;
  minSecond?: number;
  className?: string;
  /** When true, first pane is on the right/bottom instead of left/top */
  reversed?: boolean;
}

export function SplitPane({
  direction,
  first,
  second,
  size,
  onSizeChange,
  minFirst = 160,
  minSecond = 160,
  className = '',
  reversed = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const total = direction === 'horizontal' ? rect.width : rect.height;
      const offset =
        direction === 'horizontal' ? e.clientX - rect.left : e.clientY - rect.top;
      const raw = reversed ? total - offset : offset;
      const clamped = Math.max(minFirst, Math.min(total - minSecond, raw));
      onSizeChange(Math.round(clamped));
    },
    [direction, minFirst, minSecond, onSizeChange, reversed],
  );

  const stopDrag = useCallback(() => {
    dragging.current = false;
    document.body.classList.remove('is-resizing', `is-resizing-${direction}`);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopDrag);
  }, [direction, onPointerMove]);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      document.body.classList.add('is-resizing', `is-resizing-${direction}`);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', stopDrag);
    },
    [direction, onPointerMove, stopDrag],
  );

  useEffect(() => () => stopDrag(), [stopDrag]);

  // Keep panes inside the container so the first pane's trailing controls (e.g. Send) stay visible.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const clampSize = () => {
      const rect = el.getBoundingClientRect();
      const total = direction === 'horizontal' ? rect.width : rect.height;
      const max = Math.max(minFirst, total - minSecond);
      const next = Math.max(minFirst, Math.min(max, size));
      if (next !== size) onSizeChange(next);
    };

    clampSize();
    const ro = new ResizeObserver(clampSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [direction, minFirst, minSecond, onSizeChange, size]);

  const style: React.CSSProperties =
    direction === 'horizontal'
      ? {
          gridTemplateColumns: reversed
            ? `minmax(0, 1fr) 5px minmax(${minFirst}px, ${size}px)`
            : `minmax(0, ${size}px) 5px minmax(0, 1fr)`,
        }
      : {
          gridTemplateRows: reversed
            ? `minmax(0, 1fr) 5px minmax(${minFirst}px, ${size}px)`
            : `minmax(0, ${size}px) 5px minmax(0, 1fr)`,
        };

  const a = reversed ? second : first;
  const b = reversed ? first : second;

  return (
    <div
      ref={containerRef}
      className={`split-pane split-${direction} ${className}`.trim()}
      style={style}
    >
      <div className="split-pane-child">{a}</div>
      <div
        className={`split-handle split-handle-${direction}`}
        onPointerDown={startDrag}
        role="separator"
        aria-orientation={direction}
        title="Drag to resize"
      />
      <div className="split-pane-child">{b}</div>
    </div>
  );
}

export function usePersistedNumber(key: string, fallback: number) {
  const [value, setValue] = useState(() => {
    const raw = localStorage.getItem(key);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : fallback;
  });

  useEffect(() => {
    localStorage.setItem(key, String(value));
  }, [key, value]);

  return [value, setValue] as const;
}

export type EditorLayout = 'side' | 'stack';
export type PaneOrder = 'request-first' | 'response-first';

export function usePersistedString<T extends string>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    const raw = localStorage.getItem(key);
    return (raw as T) || fallback;
  });

  useEffect(() => {
    localStorage.setItem(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}
