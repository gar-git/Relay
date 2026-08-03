import { Fragment, useMemo, useRef, type Ref } from 'react';
import { tokenizeJsonLine } from '../lib/tokenizeJson';

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  textareaRef?: Ref<HTMLTextAreaElement>;
  rows?: number;
}

export function JsonBodyEditor({
  value,
  onChange,
  disabled,
  placeholder = '{\n  "key": "value"\n}',
  textareaRef,
  rows = 16,
}: Props) {
  const highlightRef = useRef<HTMLPreElement>(null);

  const lines = useMemo(() => (value || '').split('\n').map((line) => tokenizeJsonLine(line)), [value]);

  function syncScroll(el: HTMLTextAreaElement) {
    const pre = highlightRef.current;
    if (!pre) return;
    pre.scrollTop = el.scrollTop;
    pre.scrollLeft = el.scrollLeft;
  }

  return (
    <div className="json-body-editor">
      <pre ref={highlightRef} className="json-body-highlight" aria-hidden="true">
        {lines.map((tokens, i) => (
          <Fragment key={i}>
            {tokens.map((t, j) =>
              t.kind === 'plain' ? (
                <span key={j}>{t.value}</span>
              ) : (
                <span key={j} className={`json-tok json-${t.kind}`}>
                  {t.value}
                </span>
              ),
            )}
            {i < lines.length - 1 ? '\n' : null}
          </Fragment>
        ))}
      </pre>
      <textarea
        ref={textareaRef}
        className="request-body-editor json-body-textarea"
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        spellCheck={false}
        onScroll={(e) => syncScroll(e.currentTarget)}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
