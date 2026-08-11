export interface VarSegment {
  type: 'text' | 'var';
  value: string;
  name?: string;
  start: number;
  end: number;
}

export const ENV_VAR_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export function lookupEnvVar(vars: Record<string, string>, name: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
  const matched = Object.keys(vars).find((k) => k.toLowerCase() === name.toLowerCase());
  return matched !== undefined ? vars[matched] : undefined;
}

export function parseEnvVarSegments(text: string): VarSegment[] {
  const segments: VarSegment[] = [];
  let last = 0;
  ENV_VAR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ENV_VAR_RE.exec(text))) {
    if (m.index > last) {
      segments.push({ type: 'text', value: text.slice(last, m.index), start: last, end: m.index });
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
  if (last < text.length) {
    segments.push({ type: 'text', value: text.slice(last), start: last, end: text.length });
  }
  return segments;
}
