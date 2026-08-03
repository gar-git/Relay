import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { findMatches } from '../lib/findMatches';

interface Props {
  text: string;
  wrap?: boolean;
  query?: string;
  activeMatchIndex?: number;
}

type TokenKind = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punct' | 'plain';

interface Token {
  kind: TokenKind;
  value: string;
}

const TOKEN_RE =
  /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}\[\],:]|\s+|./g;

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(line))) {
    const value = match[0];
    if (/^\s+$/.test(value)) {
      tokens.push({ kind: 'plain', value });
      continue;
    }
    if (match[1] !== undefined) {
      tokens.push({ kind: 'key', value: match[1] });
      const suffix = value.slice(match[1].length);
      const spaces = suffix.slice(0, -1);
      if (spaces) tokens.push({ kind: 'plain', value: spaces });
      tokens.push({ kind: 'punct', value: ':' });
      continue;
    }
    if (match[2] !== undefined) {
      tokens.push({ kind: 'string', value });
      continue;
    }
    if (/^-?\d/.test(value)) {
      tokens.push({ kind: 'number', value });
      continue;
    }
    if (value === 'true' || value === 'false') {
      tokens.push({ kind: 'boolean', value });
      continue;
    }
    if (value === 'null') {
      tokens.push({ kind: 'null', value });
      continue;
    }
    if (/^[{}\[\],:]$/.test(value)) {
      tokens.push({ kind: 'punct', value });
      continue;
    }
    tokens.push({ kind: 'plain', value });
  }
  return tokens;
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
    return source.split('\n').map((line) => tokenizeLine(line));
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
