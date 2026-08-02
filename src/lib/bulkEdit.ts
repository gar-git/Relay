import type { KeyValue } from '../lib/types';
import { newKv } from '../lib/utils';

/** Serialize key/value rows for bulk edit (Postman-style `key:value` lines). */
export function serializeBulkRows(rows: KeyValue[], supportFiles = false): string {
  return rows
    .filter((r) => r.key || r.value || r.filePath)
    .map((r) => {
      if (supportFiles && r.kind === 'file') {
        return `${r.key}:@${r.filePath || r.fileName || r.value || ''}`;
      }
      return `${r.key}:${r.value}`;
    })
    .join('\n');
}

/** Parse bulk text into rows. Supports `key:value` or `key\\tvalue`. File: `key:@/path`. */
export function parseBulkRows(text: string, supportFiles = false): KeyValue[] {
  const rows: KeyValue[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    const tab = line.indexOf('\t');
    const colon = line.indexOf(':');
    let key = '';
    let value = '';
    if (tab >= 0 && (colon < 0 || tab < colon)) {
      key = line.slice(0, tab);
      value = line.slice(tab + 1);
    } else if (colon >= 0) {
      key = line.slice(0, colon);
      value = line.slice(colon + 1);
    } else {
      key = line;
      value = '';
    }

    key = key.trim();
    if (supportFiles && value.startsWith('@')) {
      const filePath = value.slice(1).trim();
      const fileName = filePath.split(/[/\\]/).pop() || filePath;
      rows.push({
        ...newKv(key, fileName),
        kind: 'file',
        filePath: filePath || undefined,
        fileName: fileName || undefined,
      });
    } else {
      rows.push({ ...newKv(key, value), kind: 'text' });
    }
  }
  return rows.length ? rows : [{ ...newKv(), kind: supportFiles ? 'text' : undefined }];
}
