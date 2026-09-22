// lib/enterprise/csv.ts — pure CSV serialization (RFC-4180-ish quoting).

export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const esc = (c: unknown) => `"${String(c ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(',')];
  for (const r of rows) lines.push(r.map(esc).join(','));
  return lines.join('\n');
}
