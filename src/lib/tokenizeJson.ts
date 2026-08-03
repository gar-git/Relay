export type JsonTokenKind = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punct' | 'plain';

export interface JsonToken {
  kind: JsonTokenKind;
  value: string;
}

const TOKEN_RE =
  /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}\[\],:]|\s+|./g;

/** Tokenize one line of JSON-ish text for syntax highlighting. */
export function tokenizeJsonLine(line: string): JsonToken[] {
  const tokens: JsonToken[] = [];
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
