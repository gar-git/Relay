import { useMemo } from 'react';

interface Props {
  text: string;
  wrap?: boolean;
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

export function JsonViewer({ text, wrap = true }: Props) {
  const lines = useMemo(() => {
    const source = text || '';
    return source.split('\n').map((line) => tokenizeLine(line));
  }, [text]);

  if (!text) {
    return <div className="json-viewer empty-soft">(empty)</div>;
  }

  return (
    <div className={`json-viewer${wrap ? ' wrap' : ''}`}>
      {lines.map((tokens, i) => (
        <div key={i} className="json-row">
          <div className="json-line-no" aria-hidden="true">
            {i + 1}
          </div>
          <pre className="json-line">
            {tokens.map((t, j) =>
              t.kind === 'plain' ? (
                <span key={j}>{t.value}</span>
              ) : (
                <span key={j} className={`json-tok json-${t.kind}`}>
                  {t.value}
                </span>
              ),
            )}
            {tokens.length === 0 ? '\u00a0' : null}
          </pre>
        </div>
      ))}
    </div>
  );
}
