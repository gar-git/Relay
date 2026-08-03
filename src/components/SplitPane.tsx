import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

export type SplitDirection = 'horizontal' | 'vertical';

interface Props {
  direction: SplitDirection;
  first: React.ReactNode;
  second: React.ReactNode;
  /**
   * Size of the first pane.
   * - `unit="px"`: pixels
   * - `unit="percent"`: 0–100 share of the container (responsive)
   */
  size: number;
  onSizeChange: (size: number) => void;
  minFirst?: number;
  minSecond?: number;
  className?: string;
  /** When true, first pane is on the right/bottom instead of left/top */
  reversed?: boolean;
  /** Prefer percent so panes scale with the window */
  unit?: 'px' | 'percent';
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
  unit = 'percent',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const handle = 5;
      const total = (direction === 'horizontal' ? rect.width : rect.height) - handle;
      if (total <= 0) return;

      const offset =
        direction === 'horizontal' ? e.clientX - rect.left : e.clientY - rect.top;
      const rawPx = reversed ? total - offset + handle : offset;

      if (unit === 'percent') {
        const minPct = (minFirst / total) * 100;
        const maxPct = ((total - minSecond) / total) * 100;
        const lo = Math.min(minPct, maxPct);
        const hi = Math.max(minPct, maxPct);
        const pct = (rawPx / total) * 100;
        onSizeChange(Math.round(Math.max(lo, Math.min(hi, pct)) * 10) / 10);
        return;
      }

      const maxFirst = Math.max(minFirst, total - minSecond);
      const clamped = Math.max(minFirst, Math.min(maxFirst, rawPx));
      onSizeChange(Math.round(clamped));
    },
    [direction, minFirst, minSecond, onSizeChange, reversed, unit],
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

  // Keep the first pane inside the container as the window resizes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const clampSize = () => {
      const rect = el.getBoundingClientRect();
      const handle = 5;
      const total = Math.max(0, (direction === 'horizontal' ? rect.width : rect.height) - handle);
      if (total <= 0) return;

      if (unit === 'percent') {
        if (total < minFirst + minSecond) {
          const next = (minFirst / (minFirst + minSecond)) * 100;
          if (Math.abs(next - size) > 0.05) onSizeChange(Math.round(next * 10) / 10);
          return;
        }
        const minPct = (minFirst / total) * 100;
        const maxPct = ((total - minSecond) / total) * 100;
        const next = Math.max(minPct, Math.min(maxPct, size));
        if (Math.abs(next - size) > 0.05) onSizeChange(Math.round(next * 10) / 10);
        return;
      }

      if (total < minFirst + minSecond) {
        const next = Math.round((total * minFirst) / (minFirst + minSecond));
        if (next !== size) onSizeChange(Math.max(0, next));
        return;
      }

      const max = total - minSecond;
      const next = Math.max(minFirst, Math.min(max, size));
      if (next !== size) onSizeChange(next);
    };

    clampSize();
    const ro = new ResizeObserver(clampSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [direction, minFirst, minSecond, onSizeChange, size, unit]);

  const firstFlex = unit === 'percent' ? `${size} ${size} 0%` : undefined;
  const secondFlex = unit === 'percent' ? `${Math.max(0, 100 - size)} ${Math.max(0, 100 - size)} 0%` : undefined;

  const fixedStyle: CSSProperties =
    unit === 'percent'
      ? direction === 'horizontal'
        ? { flex: firstFlex, minWidth: 0, maxWidth: '100%' }
        : { flex: firstFlex, minHeight: 0, maxHeight: '100%', width: '100%', minWidth: 0, maxWidth: '100%' }
      : direction === 'horizontal'
        ? { flex: `0 0 ${size}px`, width: size, minWidth: 0, maxWidth: '100%' }
        : {
            flex: `0 0 ${size}px`,
            height: size,
            width: '100%',
            minWidth: 0,
            maxWidth: '100%',
            minHeight: 0,
            maxHeight: '100%',
          };

  const fluidStyle: CSSProperties =
    unit === 'percent'
      ? direction === 'horizontal'
        ? { flex: secondFlex, minWidth: 0, maxWidth: '100%' }
        : { flex: secondFlex, minHeight: 0, maxHeight: '100%', width: '100%', minWidth: 0, maxWidth: '100%' }
      : direction === 'horizontal'
        ? { flex: '1 1 0%', minWidth: 0, width: 0, maxWidth: '100%' }
        : {
            flex: '1 1 0%',
            minHeight: 0,
            height: 0,
            width: '100%',
            minWidth: 0,
            maxWidth: '100%',
          };

  // In percent mode both panes are fluid shares; "fixed"/"fluid" only matter for order.
  const aStyle = unit === 'percent' ? (reversed ? fluidStyle : fixedStyle) : reversed ? fluidStyle : fixedStyle;
  const bStyle = unit === 'percent' ? (reversed ? fixedStyle : fluidStyle) : reversed ? fixedStyle : fluidStyle;

  const a = reversed ? second : first;
  const b = reversed ? first : second;

  return (
    <div
      ref={containerRef}
      className={`split-pane split-${direction} ${className}`.trim()}
    >
      <div className="split-pane-child" style={aStyle}>
        {a}
      </div>
      <div
        className={`split-handle split-handle-${direction}`}
        onPointerDown={startDrag}
        role="separator"
        aria-orientation={direction}
        title="Drag to resize"
      />
      <div className="split-pane-child" style={bStyle}>
        {b}
      </div>
    </div>
  );
}

/** Persist a split ratio. Migrates legacy pixel values (>100) to a percent fallback. */
export function usePersistedSplitPercent(key: string, fallbackPercent: number) {
  const [value, setValue] = useState(() => {
    const raw = localStorage.getItem(key);
    const n = raw ? Number(raw) : NaN;
    if (!Number.isFinite(n)) return fallbackPercent;
    // Old pixel sizes were typically 160–900; treat anything > 100 as legacy.
    if (n > 100) return fallbackPercent;
    return Math.min(90, Math.max(10, n));
  });

  useEffect(() => {
    localStorage.setItem(key, String(value));
  }, [key, value]);

  return [value, setValue] as const;
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
