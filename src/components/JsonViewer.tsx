import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { findMatches } from '../lib/findMatches';
import { tokenizeJsonLine } from '../lib/tokenizeJson';

interface Props {
  text: string;
  wrap?: boolean;
  query?: string;
  activeMatchIndex?: number;
}

/** Split a string into segments with optional highlight ranges (line-local offsets). */
function highlightSegments(
  value: string,
  lineStart: number,
  matches: { start: number; end: number }[],
  activeMatchIndex: number,
  allMatches: { start: number; end: number }[],
): ReactNode[] {
  if (!matches.length) return [value];

  const points = new Set<number>([0, value.length]);
  for (const m of matches) {
    points.add(Math.max(0, m.start - lineStart));
    points.add(Math.min(value.length, m.end - lineStart));
  }
  const sorted = [...points].sort((a, b) => a - b);
  const nodes: ReactNode[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a === b) continue;
    const absStart = lineStart + a;
    const absEnd = lineStart + b;
    const matchIdx = allMatches.findIndex((m) => absStart >= m.start && absEnd <= m.end && absStart < m.end);
    const chunk = value.slice(a, b);
    if (matchIdx >= 0) {
      nodes.push(
        <mark key={`${a}-${b}`} className={`search-hit${matchIdx === activeMatchIndex ? ' active' : ''}`}>
          {chunk}
        </mark>,
      );
    } else {
      nodes.push(<span key={`${a}-${b}`}>{chunk}</span>);
    }
  }
  return nodes;
}

export function JsonViewer({ text, wrap = true, query = '', activeMatchIndex = 0 }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => {
    const source = text || '';
    return source.split('\n').map((line) => tokenizeJsonLine(line));
  }, [text]);

  const matches = useMemo(() => findMatches(text || '', query), [text, query]);

  const lineStarts = useMemo(() => {
    const source = text || '';
    const starts: number[] = [];
    let offset = 0;
    for (const line of source.split('\n')) {
      starts.push(offset);
      offset += line.length + 1;
    }
    return starts;
  }, [text]);

  useEffect(() => {
    if (!query.trim() || !matches.length || !rootRef.current) return;
    const el = rootRef.current.querySelector('.search-hit.active');
    el?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, [query, activeMatchIndex, matches.length, text]);

  if (!text) {
    return <div className="json-viewer empty-soft">(empty)</div>;
  }

  return (
    <div ref={rootRef} className={`json-viewer${wrap ? ' wrap' : ''}`}>
      {lines.map((tokens, i) => {
        const lineStart = lineStarts[i] ?? 0;
        const lineText = (text || '').split('\n')[i] ?? '';
        const lineMatches = matches.filter((m) => m.start < lineStart + lineText.length && m.end > lineStart);

        let offsetInLine = 0;
        return (
          <div key={i} className="json-row" data-line={i}>
            <div className="json-line-no" aria-hidden="true">
              {i + 1}
            </div>
            <pre className="json-line">
              {tokens.map((t, j) => {
                const tokStart = lineStart + offsetInLine;
                offsetInLine += t.value.length;
                const tokMatches = lineMatches.filter((m) => m.start < tokStart + t.value.length && m.end > tokStart);
                const highlighted = highlightSegments(t.value, tokStart, tokMatches, activeMatchIndex, matches);

                if (t.kind === 'plain') {
                  return <span key={j}>{highlighted}</span>;
                }
                return (
                  <span key={j} className={`json-tok json-${t.kind}`}>
                    {highlighted}
                  </span>
                );
              })}
              {tokens.length === 0 ? '\u00a0' : null}
            </pre>
          </div>
        );
      })}
    </div>
  );
}
