import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SendRequestResult } from '../lib/types';
import { findMatches } from '../lib/findMatches';
import { prettyJson, statusColor } from '../lib/utils';
import { JsonViewer } from './JsonViewer';
import { PanelSearch } from './PanelSearch';

interface Props {
  result: SendRequestResult | null;
  loading: boolean;
}

function looksLikeJson(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (!(t.startsWith('{') || t.startsWith('['))) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

export function ResponseViewer({ result, loading }: Props) {
  const [tab, setTab] = useState<'body' | 'headers'>('body');
  const [pretty, setPretty] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [focusSignal, setFocusSignal] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const rawRef = useRef<HTMLPreElement>(null);

  const isJson = useMemo(() => (result ? looksLikeJson(result.body) : false), [result]);

  const bodyText = useMemo(() => {
    if (!result) return '';
    if (pretty && isJson) return prettyJson(result.body);
    return result.body;
  }, [result, pretty, isJson]);

  const headerEntries = useMemo(() => (result ? Object.entries(result.headers) : []), [result]);

  const filteredHeaders = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return headerEntries;
    return headerEntries.filter(([k, v]) => k.toLowerCase().includes(q) || v.toLowerCase().includes(q));
  }, [headerEntries, query]);

  const searchText = tab === 'body' ? bodyText : '';
  const bodyMatches = useMemo(() => findMatches(searchText, query), [searchText, query]);
  const matches = tab === 'body' ? bodyMatches : [];
  const matchCount = tab === 'body' ? bodyMatches.length : filteredHeaders.length;

  useEffect(() => {
    setActiveIndex(0);
  }, [query, tab, bodyText]);

  useEffect(() => {
    if (activeIndex >= matchCount && matchCount > 0) {
      setActiveIndex(0);
    }
  }, [activeIndex, matchCount]);

  useEffect(() => {
    if (tab !== 'body' || (isJson && pretty) || !query.trim() || !matches.length) return;
    const el = rawRef.current?.querySelector('.search-hit.active');
    el?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, [tab, isJson, pretty, query, activeIndex, matches.length]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        e.stopPropagation();
        setFocusSignal((n) => n + 1);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        const ae = document.activeElement;
        const panel = panelRef.current;
        if (!panel) return;
        if (ae && panel.contains(ae)) {
          // If an actual form control (or editable content) is focused, let native Ctrl+A work there.
          const t = ae as HTMLElement;
          const tag = t.tagName?.toLowerCase();
          const isTextControl = tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
          if (isTextControl) return;
        }
        e.preventDefault();
        const target = panel.querySelector('.panel-body');
        if (!target) return;
        const sel = window.getSelection();
        sel?.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(target);
        sel?.addRange(range);
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, []);

  async function copyBody() {
    if (!bodyText) return;
    try {
      await navigator.clipboard.writeText(bodyText);
    } catch {
      /* ignore */
    }
  }

  function goNext() {
    if (!matchCount) return;
    setActiveIndex((i) => (i + 1) % matchCount);
  }

  function goPrev() {
    if (!matchCount) return;
    setActiveIndex((i) => (i - 1 + matchCount) % matchCount);
  }

  function renderHighlightedText(text: string) {
    if (!query.trim() || !matches.length) return text || '(empty)';
    const parts: ReactNode[] = [];
    let cursor = 0;
    matches.forEach((m, idx) => {
      if (m.start > cursor) parts.push(text.slice(cursor, m.start));
      parts.push(
        <mark key={`${m.start}-${idx}`} className={`search-hit${idx === activeIndex ? ' active' : ''}`}>
          {text.slice(m.start, m.end)}
        </mark>,
      );
      cursor = m.end;
    });
    if (cursor < text.length) parts.push(text.slice(cursor));
    return parts;
  }

  const searchBar = (
    <PanelSearch
      value={query}
      onChange={setQuery}
      matchCount={matchCount}
      activeIndex={matchCount ? activeIndex : 0}
      onPrev={goPrev}
      onNext={goNext}
      placeholder="Search…"
      focusSignal={focusSignal}
    />
  );

  if (loading) {
    return (
      <div
        className="panel"
        ref={panelRef}
        tabIndex={0}
        onMouseDown={(e) => {
          const t = e.target as HTMLElement | null;
          if (!t) return;
          const tag = t.tagName?.toLowerCase();
          const isTextControl = tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
          if (isTextControl) return;
          panelRef.current?.focus();
        }}
      >
        <div className="meta-row">
          <span>Sending…</span>
          {searchBar}
        </div>
        <div className="panel-body empty">Waiting for response</div>
      </div>
    );
  }

  if (!result) {
    return (
      <div
        className="panel"
        ref={panelRef}
        tabIndex={0}
        onMouseDown={(e) => {
          const t = e.target as HTMLElement | null;
          if (!t) return;
          const tag = t.tagName?.toLowerCase();
          const isTextControl = tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
          if (isTextControl) return;
          panelRef.current?.focus();
        }}
      >
        <div className="meta-row">
          <span>Response</span>
          {searchBar}
        </div>
        <div className="panel-body empty">Send a request to see the response</div>
      </div>
    );
  }

  if (result.error) {
    return (
      <div
        className="panel"
        ref={panelRef}
        tabIndex={0}
        onMouseDown={(e) => {
          const t = e.target as HTMLElement | null;
          if (!t) return;
          const tag = t.tagName?.toLowerCase();
          const isTextControl = tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
          if (isTextControl) return;
          panelRef.current?.focus();
        }}
      >
        <div className="meta-row">
          <span style={{ color: 'var(--err)' }}>Error</span>
          <span>{result.durationMs} ms</span>
          {searchBar}
        </div>
        <div className="panel-body panel-body-scroll">
          <pre ref={rawRef} className={`response-body${wrap ? ' wrap' : ''}`} style={{ color: 'var(--err)' }}>
            {renderHighlightedText(result.error)}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div
      className="panel"
      ref={panelRef}
      tabIndex={0}
      onMouseDown={(e) => {
        const t = e.target as HTMLElement | null;
        if (!t) return;
        const tag = t.tagName?.toLowerCase();
        const isTextControl = tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
        if (isTextControl) return;
        panelRef.current?.focus();
      }}
    >
      <div className="meta-row">
        {isJson && (
          <button type="button" className="ghost" onClick={() => setPretty((p) => !p)}>
            {pretty ? 'Raw' : 'Pretty'}
          </button>
        )}
        <button type="button" className={`ghost${wrap ? ' active-soft' : ''}`} onClick={() => setWrap((w) => !w)}>
          Wrap
        </button>
        <button type="button" className="ghost" onClick={() => void copyBody()} disabled={!bodyText}>
          Copy
        </button>
        <span style={{ color: statusColor(result.status), fontWeight: 700 }}>
          {result.status} {result.statusText}
        </span>
        <span>{result.durationMs} ms</span>
        <span>
          {result.sizeBytes < 1024
            ? `${result.sizeBytes} B`
            : `${(result.sizeBytes / 1024).toFixed(2)} KB`}
        </span>
        {searchBar}
      </div>
      <div className="panel-tabs">
        <button type="button" className={tab === 'body' ? 'active' : ''} onClick={() => setTab('body')}>
          Body
        </button>
        <button type="button" className={tab === 'headers' ? 'active' : ''} onClick={() => setTab('headers')}>
          Headers ({Object.keys(result.headers).length})
        </button>
      </div>
      <div className={`panel-body panel-body-scroll${tab === 'body' ? ' response-panel-body' : ''}`}>
        {tab === 'body' ? (
          isJson && pretty ? (
            <JsonViewer text={bodyText} wrap={wrap} query={query} activeMatchIndex={activeIndex} />
          ) : (
            <pre ref={rawRef} className={`response-body${wrap ? ' wrap' : ''}`}>
              {bodyText ? renderHighlightedText(bodyText) : '(empty)'}
            </pre>
          )
        ) : (
          <table className="kv-table kv-response">
            <thead>
              <tr>
                <th className="kv-col-key">Header</th>
                <th className="kv-col-value">Value</th>
              </tr>
            </thead>
            <tbody>
              {filteredHeaders.map(([k, v]) => (
                  <tr key={k}>
                    <td className="kv-key">{k}</td>
                    <td className="kv-val">{v}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
