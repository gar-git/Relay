import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type MutableRefObject,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { lookupEnvVar, parseEnvVarSegments, type VarSegment } from '../lib/envVars';

interface Props {
  value: string;
  onChange: (value: string) => void;
  variables: Record<string, string>;
  envName?: string | null;
  onUpdateVariable?: (name: string, value: string) => void | Promise<void>;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  type?: 'text' | 'password';
  /** Extra class on the outer wrap */
  wrapClassName?: string;
  /** Extra class on the transparent editable input */
  inputClassName?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onPaste?: (e: ClipboardEvent<HTMLInputElement>) => void;
  inputRef?: Ref<HTMLInputElement>;
}

interface HoverTip {
  name: string;
  editValue: string;
  resolved: string | null;
  left: number;
  top: number;
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

function tipPositionForVar(input: HTMLInputElement, seg: VarSegment): { left: number; top: number } {
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

export function VarAwareInput({
  value,
  onChange,
  variables,
  envName,
  onUpdateVariable,
  disabled,
  readOnly,
  placeholder,
  type = 'text',
  wrapClassName = '',
  inputClassName = '',
  onKeyDown,
  onPaste,
  inputRef,
}: Props) {
  const localRef = useRef<HTMLInputElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  const overTooltip = useRef(false);
  const [tip, setTip] = useState<HoverTip | null>(null);
  const [saving, setSaving] = useState(false);

  const segments = useMemo(() => parseEnvVarSegments(value), [value]);
  const showHighlight = type !== 'password';

  useEffect(() => {
    return () => {
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    };
  }, []);

  function setInputRef(node: HTMLInputElement | null) {
    (localRef as MutableRefObject<HTMLInputElement | null>).current = node;
    if (!inputRef) return;
    if (typeof inputRef === 'function') {
      inputRef(node);
      return;
    }
    (inputRef as MutableRefObject<HTMLInputElement | null>).current = node;
  }

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
    }, 350);
  }

  function showTipFor(seg: VarSegment, input: HTMLInputElement) {
    if (!seg.name) return;
    clearHideTimer();
    const resolved = lookupEnvVar(variables, seg.name);
    const pos = tipPositionForVar(input, seg);
    setTip({
      name: seg.name,
      editValue: resolved !== undefined ? resolved : '',
      resolved: resolved !== undefined ? resolved : null,
      left: pos.left,
      top: pos.top,
    });
  }

  function syncScroll() {
    const input = localRef.current;
    const hl = highlightRef.current;
    if (!input || !hl) return;
    hl.scrollLeft = input.scrollLeft;
  }

  function onMouseMove(e: MouseEvent<HTMLInputElement>) {
    if (!showHighlight) return;
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
    if (tip?.name === hit.name) {
      clearHideTimer();
      return;
    }
    showTipFor(hit, input);
  }

  async function commitVariable() {
    if (!tip || !onUpdateVariable || readOnly || disabled) return;
    const current = tip.resolved !== null ? tip.resolved : '';
    if (tip.editValue === current) return;
    setSaving(true);
    try {
      await onUpdateVariable(tip.name, tip.editValue);
      setTip((t) =>
        t
          ? {
              ...t,
              resolved: tip.editValue,
              editValue: tip.editValue,
            }
          : null,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`var-input-wrap ${wrapClassName}`.trim()}>
      {showHighlight && (
        <div ref={highlightRef} className="var-input-highlight" aria-hidden="true">
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
              const resolved = s.name ? lookupEnvVar(variables, s.name) : undefined;
              const unresolved = resolved === undefined;
              return (
                <span key={i} className={`url-var${unresolved ? ' is-unresolved' : ''}`}>
                  {s.value}
                </span>
              );
            })
          )}
        </div>
      )}
      <input
        ref={setInputRef}
        className={`var-input-edit ${inputClassName}`.trim()}
        type={type}
        value={value}
        disabled={disabled}
        readOnly={readOnly}
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
            role="dialog"
            aria-label={`Edit environment variable ${tip.name}`}
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
              {tip.resolved !== null ? (envName ? `${envName}` : 'Environment') : 'Unresolved'} · {`{{${tip.name}}}`}
            </div>
            {onUpdateVariable && !readOnly && !disabled ? (
              <>
                <input
                  className={`url-var-tooltip-value url-var-tooltip-input${tip.resolved === null ? ' is-missing' : ''}`}
                  value={tip.editValue}
                  placeholder={tip.resolved === null ? 'Set value…' : ''}
                  spellCheck={false}
                  disabled={saving}
                  onChange={(e) => setTip((t) => (t ? { ...t, editValue: e.target.value } : null))}
                  onBlur={() => void commitVariable()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void commitVariable().then(() => setTip(null));
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setTip(null);
                    }
                  }}
                />
                <p className="url-var-tooltip-hint">Edit value · Enter to save · Esc to close</p>
              </>
            ) : (
              <div className={`url-var-tooltip-value${tip.resolved === null ? ' is-missing' : ''}`}>
                {tip.resolved !== null ? tip.resolved || '(empty)' : `{{${tip.name}}} is not defined`}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
