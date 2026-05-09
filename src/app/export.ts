import type { CaseRow, UserRow } from './types';
import { formatConsultant, formatOperationTags, parseConsultant } from './utils';

function escapeCsvCell(value: string): string {
  // Prevent CSV/Excel formula injection when exported files are opened in spreadsheet apps.
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

function caseRowToCsvLine(row: CaseRow): string {
  const op = formatOperationTags(row.operation);
  const cons = formatConsultant(parseConsultant(row.consultant));
  const cols = [
    row.id,
    row.case_date,
    row.specialty ?? '',
    row.hospital ?? '',
    op,
    row.cepod ?? '',
    cons,
    row.role,
    row.notes ?? '',
    row.created_at,
    row.updated_at,
  ];
  return cols.map((c) => escapeCsvCell(String(c))).join(',');
}

const CSV_HEADER =
  'id,case_date,specialty,hospital,operation,cepod,consultant,role,notes,created_at,updated_at';

export function casesToCsv(cases: CaseRow[]): string {
  const lines = cases.map(caseRowToCsvLine);
  return [CSV_HEADER, ...lines].join('\r\n');
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportCasesCsv(cases: CaseRow[]) {
  const stamp = new Date().toISOString().slice(0, 10);
  downloadTextFile(`elogbook-cases-${stamp}.csv`, casesToCsv(cases), 'text/csv;charset=utf-8');
}

export function exportFullJson(user: UserRow | null, cases: CaseRow[]) {
  const stamp = new Date().toISOString().slice(0, 10);
  const payload = {
    exportedAt: new Date().toISOString(),
    user,
    cases,
  };
  downloadTextFile(
    `elogbook-export-${stamp}.json`,
    JSON.stringify(payload, null, 2),
    'application/json;charset=utf-8',
  );
}
