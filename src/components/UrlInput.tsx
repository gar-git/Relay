import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { isProbablyCurl } from '../lib/parseCurl';

interface Props {
  value: string;
  variables: Record<string, string>;
  envName?: string | null;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onPasteCurl?: (text: string) => void;
}

interface Segment {
  type: 'text' | 'var';
  value: string;
  name?: string;
  start: number;
  end: number;
}

interface HoverTip {
  name: string;
  resolved: string | null;
  left: number;
  top: number;
}

const VAR_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

function lookupVar(vars: Record<string, string>, name: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
  const matched = Object.keys(vars).find((k) => k.toLowerCase() === name.toLowerCase());
  return matched !== undefined ? vars[matched] : undefined;
}

function parseSegments(url: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  VAR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = VAR_RE.exec(url))) {
    if (m.index > last) {
      segments.push({ type: 'text', value: url.slice(last, m.index), start: last, end: m.index });
    }
    segments.push({
      type: 'var',
      value: m[0],
      name: m[1],
      start: m.index,
      end: m.index + m[0].length,
    });
    last = m.index + m[0].length;
  }
  if (last < url.length) {
    segments.push({ type: 'text', value: url.slice(last), start: last, end: url.length });
  }
  return segments;
}

function measureCtx(input: HTMLInputElement): CanvasRenderingContext2D | null {
  const style = getComputedStyle(input);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`.trim();
  return ctx;
}

function charIndexAtX(input: HTMLInputElement, clientX: number): number {
  const style = getComputedStyle(input);
  const rect = input.getBoundingClientRect();
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const x = clientX - rect.left - paddingLeft + input.scrollLeft;
  if (x <= 0) return 0;

  const ctx = measureCtx(input);
  if (!ctx) return 0;

  const text = input.value;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid)).width <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function tipPositionForVar(input: HTMLInputElement, seg: Segment): { left: number; top: number } {
  const style = getComputedStyle(input);
  const rect = input.getBoundingClientRect();
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const ctx = measureCtx(input);
  const startX = ctx ? ctx.measureText(input.value.slice(0, seg.start)).width : 0;
  const endX = ctx ? ctx.measureText(input.value.slice(0, seg.end)).width : startX;
  const mid = (startX + endX) / 2;
  const left = rect.left + paddingLeft + mid - input.scrollLeft;
  return {
    left: Math.max(8, Math.min(left - 70, window.innerWidth - 280)),
    top: rect.bottom + 8,
  };
}

export function UrlInput({
  value,
  variables,
  envName,
  disabled,
  placeholder = 'https://api.example.com/v1/resource, {{baseUrl}}/users, or paste a cURL',
  onChange,
  onSend,
  onPasteCurl,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  const overTooltip = useRef(false);
  const [tip, setTip] = useState<HoverTip | null>(null);

  const segments = useMemo(() => parseSegments(value), [value]);

  useEffect(() => {
    return () => {
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    };
  }, []);

  function clearHideTimer() {
    if (hideTimer.current != null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }

  function scheduleHide() {
    clearHideTimer();
    hideTimer.current = window.setTimeout(() => {
      if (!overTooltip.current) setTip(null);
    }, 200);
  }

  function showTipFor(seg: Segment, input: HTMLInputElement) {
    if (!seg.name) return;
    clearHideTimer();
    const resolved = lookupVar(variables, seg.name);
    const pos = tipPositionForVar(input, seg);
    setTip({
      name: seg.name,
      resolved: resolved !== undefined ? resolved : null,
      left: pos.left,
      top: pos.top,
    });
  }

  function syncScroll() {
    const input = inputRef.current;
    const hl = highlightRef.current;
    if (!input || !hl) return;
    hl.scrollLeft = input.scrollLeft;
  }

  function onMouseMove(e: MouseEvent<HTMLInputElement>) {
    // Don't flash tooltip while dragging to place/select caret
    if (e.buttons !== 0) {
      clearHideTimer();
      setTip(null);
      return;
    }
    const input = e.currentTarget;
    const idx = charIndexAtX(input, e.clientX);
    const hit = segments.find((s) => s.type === 'var' && idx >= s.start && idx < s.end);
    if (!hit || !hit.name) {
      scheduleHide();
      return;
    }
    // Keep existing tip if same var — avoids flicker while editing nearby
    if (tip?.name === hit.name) {
      clearHideTimer();
      return;
    }
    showTipFor(hit, input);
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text');
    if (text && isProbablyCurl(text) && onPasteCurl) {
      e.preventDefault();
      onPasteCurl(text);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') onSend();
    // Typing shouldn't require the tip; keep it if caret stays in same var
  }

  return (
    <div className="url-input-wrap">
      <div ref={highlightRef} className="url-input-highlight" aria-hidden="true">
        {segments.length === 0 ? (
          <span className="url-plain">{'\u00a0'}</span>
        ) : (
          segments.map((s, i) => {
            if (s.type === 'text') {
              return (
                <span key={i} className="url-plain">
                  {s.value}
                </span>
              );
            }
            const resolved = s.name ? lookupVar(variables, s.name) : undefined;
            const unresolved = resolved === undefined;
            return (
              <span key={i} className={`url-var${unresolved ? ' is-unresolved' : ''}`}>
                {s.value}
              </span>
            );
          })
        )}
      </div>
      <input
        ref={inputRef}
        className="url-input url-input-edit"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        onMouseMove={onMouseMove}
        onMouseLeave={() => scheduleHide()}
        onMouseDown={() => {
          clearHideTimer();
          setTip(null);
        }}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
      />
      {tip &&
        createPortal(
          <div
            className="url-var-tooltip"
            style={{ left: tip.left, top: tip.top }}
            role="tooltip"
            onMouseEnter={() => {
              overTooltip.current = true;
              clearHideTimer();
            }}
            onMouseLeave={() => {
              overTooltip.current = false;
              scheduleHide();
            }}
          >
            <div className="url-var-tooltip-label">
              {tip.resolved !== null ? (envName ? `${envName}` : 'Environment') : 'Unresolved'}
            </div>
            <div className={`url-var-tooltip-value${tip.resolved === null ? ' is-missing' : ''}`}>
              {tip.resolved !== null ? tip.resolved || '(empty)' : `{{${tip.name}}} is not defined`}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
