import { jsPDF } from 'jspdf';
import {
  canonicalRole,
  DEFAULT_SURGICAL_SPECIALTY,
  REPORT_PDF_SIZE_PRESETS,
  ROLES,
  type ReportPdfFontFamily,
  type ReportPdfLayout,
  type ReportPdfSizePreset,
} from './constants';
import type { CaseRow, Preferences } from './types';
import {
  formatCaseDateUK,
  formatConsultant,
  formatDateISO,
  formatOperationTags,
  formatTraineeLine,
  parseConsultant,
} from './utils';

function formatTraineeWithBrackets(
  prefs: Preferences,
  grade: string | null,
  includeGmc: boolean,
  includeGrade: boolean,
): string {
  let line = formatTraineeLine(prefs);
  if (includeGrade && grade?.trim()) line += ` (${grade.trim()})`;
  if (includeGmc && prefs.gmcNumber?.trim()) line += ` (GMC ${prefs.gmcNumber.trim()})`;
  return line;
}

export type ReportPdfOptions = {
  prefs: Preferences;
  grade: string | null;
  cases: CaseRow[];
  dateFrom: string;
  dateTo: string;
  layout: ReportPdfLayout;
  includeGmc: boolean;
  includeGrade: boolean;
  fontFamily: ReportPdfFontFamily;
  fontSizePreset: ReportPdfSizePreset;
  /** Extra summary page with counts by specialty and role (after the case list). Default true. */
  includeConsolidationReport?: boolean;
  /** Extra lines printed after the period block (e.g. active filters). */
  headerNotes?: string[];
};

/** Tailwind `clinical-600` — matches in-app brand text. */
const RGB_CLINICAL: [number, number, number] = [37, 99, 235];
const RGB_SLATE: [number, number, number] = [15, 23, 42];
const RGB_MUTED: [number, number, number] = [100, 116, 139];
const RGB_BORDER: [number, number, number] = [226, 232, 240];
const RGB_HEADER_BG: [number, number, number] = [248, 250, 252];
const RGB_BOX_BORDER: [number, number, number] = [148, 163, 184];

const SITE_DISPLAY = 'surgicalelogbook.com';
const SITE_URL = 'https://surgicalelogbook.com/';

function inRange(c: CaseRow, from: string, to: string): boolean {
  const d = c.case_date;
  return d >= from && d <= to;
}

function tableSpecialtyLabel(c: CaseRow): string {
  return c.specialty?.trim() ? c.specialty : DEFAULT_SURGICAL_SPECIALTY;
}

/** Canonical role column key, legacy free text, or null when role is unset (excluded from consolidation grid). */
function roleBucketForCase(c: CaseRow): string | null {
  const raw = c.role?.trim() ?? '';
  if (!raw) return null;
  const canon = canonicalRole(raw);
  if (canon) return canon;
  return raw;
}

function buildSpecialtyRoleMatrix(cases: CaseRow[]): {
  specialties: string[];
  roles: string[];
  countAt: (spec: string, role: string) => number;
} {
  const specialties = [...new Set(cases.map(tableSpecialtyLabel))].sort((a, b) => a.localeCompare(b));
  const standard = new Set<string>(ROLES as unknown as string[]);
  const extras = new Set<string>();
  for (const c of cases) {
    const b = roleBucketForCase(c);
    if (b !== null && !standard.has(b)) extras.add(b);
  }
  const roles = [...ROLES, ...[...extras].sort((a, b) => a.localeCompare(b))];
  const grid = new Map<string, Map<string, number>>();
  for (const sp of specialties) {
    grid.set(sp, new Map());
  }
  for (const c of cases) {
    const sp = tableSpecialtyLabel(c);
    const r = roleBucketForCase(c);
    const row = grid.get(sp);
    if (!row || r === null) continue;
    row.set(r, (row.get(r) ?? 0) + 1);
  }
  return {
    specialties,
    roles,
    countAt: (spec, role) => grid.get(spec)?.get(role) ?? 0,
  };
}

function scaleForPreset(preset: ReportPdfSizePreset): number {
  const row = REPORT_PDF_SIZE_PRESETS.find((x) => x.value === preset);
  return row?.scale ?? 1;
}

function lineHeightMm(doc: jsPDF, sizePt: number): number {
  const factor = doc.getLineHeightFactor() || 1.15;
  return ((sizePt * 25.4) / 72) * factor;
}

const PDF_TABLE_CELL_PAD = 1.6;

/** Height of one grid row (same geometry as the case table). */
function pdfGridRowHeight(
  doc: jsPDF,
  cellLines: string[][],
  isHeader: boolean,
  pad: number,
  bodySize: number,
  headSize: number,
): number {
  const lh = isHeader ? lineHeightMm(doc, headSize) : lineHeightMm(doc, bodySize);
  const m = Math.max(1, ...cellLines.map((l) => l.length));
  return pad * 2 + m * lh;
}

/** One table row: bordered body cells or filled header cells (matches case table styling). */
function drawPdfGridRow(
  ctx: PdfContext,
  x0: number,
  y: number,
  tableWidth: number,
  colWidths: number[],
  cellLines: string[][],
  opts: {
    isHeader: boolean;
    drawTopEdge: boolean;
    pad: number;
    bodySize: number;
    headSize: number;
  },
): number {
  const { doc } = ctx;
  const { isHeader, drawTopEdge, pad, bodySize, headSize } = opts;
  const lh = isHeader ? lineHeightMm(doc, headSize) : lineHeightMm(doc, bodySize);
  const fs = isHeader ? headSize : bodySize;
  const m = Math.max(1, ...cellLines.map((l) => l.length));
  const h = pad * 2 + m * lh;

  let x = x0;
  doc.setDrawColor(...RGB_BORDER);
  doc.setLineWidth(0.2);
  if (drawTopEdge) {
    doc.line(x0, y, x0 + tableWidth, y);
  }
  for (let j = 0; j < colWidths.length; j++) {
    const cw = colWidths[j]!;
    if (isHeader) {
      doc.setFillColor(...RGB_HEADER_BG);
      doc.rect(x, y, cw, h, 'FD');
    } else {
      doc.rect(x, y, cw, h, 'S');
    }
    doc.setFont(ctx.fontFamily, isHeader ? 'bold' : 'normal');
    doc.setFontSize(fs);
    doc.setTextColor(...RGB_SLATE);
    let ty = y + pad + lh * 0.72;
    for (const line of cellLines[j]!) {
      doc.text(line, x + pad, ty);
      ty += lh;
    }
    x += cw;
  }
  doc.line(x0, y + h, x0 + tableWidth, y + h);
  return h;
}

type PdfContext = {
  doc: jsPDF;
  pageW: number;
  pageH: number;
  margin: number;
  fontFamily: ReportPdfFontFamily;
  s: (pt: number) => number;
  g: (gap: number) => number;
};

/**
 * Single-row supervisor strip for continuation pages (no title, no trainee declaration).
 * Anchored so the box bottom aligns with `pageH - margin`, matching the full sign-off block.
 */
function drawCondensedSupervisorSignOff(ctx: PdfContext): void {
  const { doc } = ctx;
  const pageIdx = doc.getNumberOfPages();
  doc.setPage(pageIdx);

  const left = ctx.margin;
  const w = ctx.pageW - ctx.margin * 2;
  const bottom = ctx.pageH - ctx.margin;

  const mFull = computeSignOffLayout(ctx);
  const { pad, firstRowH, colGap } = mFull;
  const innerW = w - pad * 2;
  const gmcColW = Math.min(26, Math.max(19, innerW * 0.13));
  const dateColW = Math.min(28, Math.max(21, innerW * 0.12));
  const sigColW = Math.min(42, Math.max(30, innerW * 0.28));
  const nameColW = innerW - gmcColW - dateColW - sigColW - 3 * colGap;

  const boxH = pad * 2 + firstRowH;
  const boxTop = bottom - boxH;

  doc.setDrawColor(...RGB_BOX_BORDER);
  doc.setLineWidth(0.45);
  doc.rect(left, boxTop, w, boxH, 'S');

  const iy = boxTop + pad;
  const labelY = iy + ctx.s(8.5) * 0.34;
  const x0 = left + pad;
  let cx = x0;

  doc.setFont(ctx.fontFamily, 'normal');
  doc.setTextColor(...RGB_MUTED);
  doc.setFontSize(ctx.s(8.5));
  doc.text('Name', cx, labelY);
  cx += nameColW + colGap;
  doc.setFontSize(ctx.s(7.8));
  doc.text('GMC', cx, labelY);
  cx += gmcColW + colGap;
  doc.text('Date', cx, labelY);
  cx += dateColW + colGap;
  doc.text('Signature', cx, labelY);

  const lineY = iy + firstRowH - 1.25;
  doc.setDrawColor(...RGB_BORDER);
  doc.setLineWidth(0.28);
  cx = x0;
  doc.line(cx, lineY, cx + nameColW, lineY);
  cx += nameColW + colGap;
  doc.line(cx, lineY, cx + gmcColW, lineY);
  cx += gmcColW + colGap;
  doc.line(cx, lineY, cx + dateColW, lineY);
  cx += dateColW + colGap;
  doc.line(cx, lineY, cx + sigColW, lineY);
}

function newPage(ctx: PdfContext): number {
  drawCondensedSupervisorSignOff(ctx);
  ctx.doc.addPage();
  return ctx.margin;
}

/** Max Y (exclusive) for bottom of table content: page bottom minus reserved sign-off block. */
function tableContentMaxBottom(ctx: PdfContext, signOffReserveMm: number): number {
  return ctx.pageH - ctx.margin - signOffReserveMm;
}

/** Text logo: “Surgical” + “eLogbook” on one line (brand colours). */
function drawBrandLogo(ctx: PdfContext, x: number, y: number, sizePt: number): void {
  const { doc } = ctx;
  doc.setFont(ctx.fontFamily, 'bold');
  doc.setFontSize(ctx.s(sizePt));
  doc.setTextColor(...RGB_CLINICAL);
  doc.text('Surgical', x, y);
  const w = doc.getTextWidth('Surgical');
  doc.setTextColor(...RGB_SLATE);
  doc.text(' eLogbook', x + w, y);
}

/**
 * Shared header: logo; left — trainee + Cases: n (same style as name); top-right — URL, report period, date of report.
 */
function drawReportHeader(
  ctx: PdfContext,
  prefs: Preferences,
  grade: string | null,
  dateFrom: string,
  dateTo: string,
  includeGmc: boolean,
  includeGrade: boolean,
  headerNotes: string[],
  casesInRange: CaseRow[],
  yStart: number,
): number {
  const { doc } = ctx;
  let y = yStart;

  const xR = ctx.pageW - ctx.margin;
  /** Trainee name / Cases: bold 10 pt; top-right URL / dates: normal 10 pt. */
  const headerBodyPt = ctx.s(10);
  const periodStr = `Report period: ${dateFrom} to ${dateTo}`;
  const dateReportStr = `Date of report: ${formatDateISO(new Date())}`;

  doc.setFont(ctx.fontFamily, 'normal');
  doc.setFontSize(headerBodyPt);
  const siteW = doc.getTextWidth(SITE_DISPLAY);
  const periodW = doc.getTextWidth(periodStr);
  const dateRepW = doc.getTextWidth(dateReportStr);
  const rightBlockW = Math.max(siteW, periodW, dateRepW) + ctx.g(2);
  const inner = ctx.pageW - ctx.margin * 2;
  const rightColReserve = Math.min(inner * 0.48, Math.max(52, rightBlockW));
  const leftMaxW = inner - rightColReserve - ctx.g(3);

  const traineeLine = formatTraineeWithBrackets(prefs, grade, includeGmc, includeGrade);
  const total = casesInRange.length;

  /** Same baseline Y as the logo’s first line (`drawBrandLogo(..., y + 6, 14)`). */
  const logoLineY = y + 6;
  const headerLineH = ctx.g(5.2);

  drawBrandLogo(ctx, ctx.margin, logoLineY, 14);

  let yR = logoLineY;
  doc.setFont(ctx.fontFamily, 'normal');
  doc.setFontSize(headerBodyPt);
  doc.setTextColor(...RGB_CLINICAL);
  doc.text(SITE_DISPLAY, xR, yR, { align: 'right' });
  doc.link(xR - siteW, yR - 3.6, siteW, 5.4, { url: SITE_URL });
  yR += headerLineH;
  doc.setTextColor(...RGB_MUTED);
  doc.text(periodStr, xR, yR, { align: 'right' });
  yR += headerLineH;
  doc.text(dateReportStr, xR, yR, { align: 'right' });
  yR += ctx.g(5.5);

  y += ctx.g(13);
  const nameTop = y;

  doc.setFont(ctx.fontFamily, 'bold');
  doc.setFontSize(headerBodyPt);
  doc.setTextColor(...RGB_SLATE);
  const nameLines = doc.splitTextToSize(traineeLine, leftMaxW);
  const nameLineH = ctx.g(5.2);
  let yName = nameTop;
  for (const ln of nameLines) {
    doc.text(ln, ctx.margin, yName);
    yName += nameLineH;
  }
  doc.text(`Cases: ${total}`, ctx.margin, yName);
  yName += nameLineH;

  y = Math.max(yName, yR);

  doc.setFont(ctx.fontFamily, 'normal');
  doc.setFontSize(ctx.s(8.5));
  doc.setTextColor(...RGB_SLATE);
  for (const note of headerNotes) {
    if (!note.trim()) continue;
    doc.setTextColor(...RGB_MUTED);
    const wrapped = doc.splitTextToSize(note.trim(), ctx.pageW - ctx.margin * 2);
    for (const ln of wrapped) {
      doc.text(ln, ctx.margin, y);
      y += ctx.g(4.2);
    }
  }

  y += ctx.g(3);
  doc.setTextColor(...RGB_SLATE);
  return y;
}

type SignOffLayout = {
  declLines: string[];
  declLineH: number;
  /** Space from last disclaimer line to top of sign-off box (mm). */
  declGapAboveBox: number;
  declBlockH: number;
  boxH: number;
  totalMm: number;
  pad: number;
  intraGap: number;
  titleH: number;
  /** One row: Name | GMC | Role | Date — labels + writing space + rules. */
  firstRowH: number;
  /** Shared height for signature + comments panels. */
  twinH: number;
  nameColW: number;
  gmcColW: number;
  roleColW: number;
  dateColW: number;
  colGap: number;
  sigW: number;
  twinGap: number;
};

/** Single source of truth for sign-off block size and interior dimensions. */
function computeSignOffLayout(ctx: PdfContext): SignOffLayout {
  const { doc } = ctx;
  const w = ctx.pageW - ctx.margin * 2;
  doc.setFont(ctx.fontFamily, 'normal');
  doc.setFontSize(ctx.s(8));
  const declLines = doc.splitTextToSize(
    'I confirm that this logbook contains no patient-identifiable information. The entries record operative exposure and training activity only.',
    w,
  );
  /** Tighter lines = shorter block → disclaimer sits lower on page (closer to box from above). */
  const declLineH = ctx.g(3.35);
  const declGapAboveBox = 0.2;
  const declBlockH = declLines.length * declLineH + declGapAboveBox;

  const pad = 2.4;
  const titleH = ctx.g(4.8);
  const intraGap = ctx.g(2.4);
  /** Room under labels for handwriting before the rule (label band + gap + rule). */
  const firstRowH = ctx.s(8.5) * 0.38 + ctx.g(6.2) + ctx.g(2.8);
  const twinH = 12.5;
  const twinGap = 2.6;

  const innerW = w - pad * 2;
  const colGap = 2.2;
  const dateColW = Math.min(32, Math.max(22, innerW * 0.12));
  const gmcColW = Math.min(28, Math.max(21, innerW * 0.12));
  let nameColW = innerW * 0.34;
  let roleColW = innerW - nameColW - gmcColW - dateColW - 3 * colGap;
  if (roleColW < innerW * 0.2) {
    nameColW = Math.max(innerW * 0.28, nameColW - (innerW * 0.22 - roleColW));
    roleColW = innerW - nameColW - gmcColW - dateColW - 3 * colGap;
  }
  const rowSum = nameColW + gmcColW + roleColW + dateColW + 3 * colGap;
  nameColW += innerW - rowSum;

  const sigW = Math.min(40, Math.max(30, Math.floor(innerW * 0.31)));
  const boxH = pad * 2 + titleH + intraGap + firstRowH + intraGap + twinH + 0.5;
  const totalMm = declBlockH + boxH;
  return {
    declLines,
    declLineH,
    declGapAboveBox,
    declBlockH,
    boxH,
    totalMm,
    pad,
    intraGap,
    titleH,
    firstRowH,
    twinH,
    nameColW,
    gmcColW,
    roleColW,
    dateColW,
    colGap,
    sigW,
    twinGap,
  };
}

function measureSignOffReserveMm(ctx: PdfContext): number {
  return computeSignOffLayout(ctx).totalMm + 2;
}

type TableCol = { w: number; header: string; cell: (c: CaseRow) => string };

type CaseTableColumnFlags = {
  includeNotes: boolean;
  includeTrust: boolean;
  includeSpecialty: boolean;
  includeCepod: boolean;
};

/** Standard consolidation table: date, specialty, trust, operation, CEPOD, consultant, role — no notes. */
const STANDARD_REPORT_COLUMN_FLAGS: CaseTableColumnFlags = {
  includeNotes: false,
  includeTrust: true,
  includeSpecialty: true,
  includeCepod: true,
};

function buildCaseTableColumns(tableWidth: number, flags: CaseTableColumnFlags): TableCol[] {
  const { includeNotes, includeTrust, includeSpecialty, includeCepod } = flags;
  const compactish = !includeTrust && !includeSpecialty && !includeCepod && !includeNotes;
  const opW = includeNotes ? 55 : compactish ? 100 : includeTrust ? 72 : 80;
  const rel: TableCol[] = [{ w: 22, header: 'Date', cell: (c: CaseRow) => formatCaseDateUK(c.case_date) }];
  if (includeSpecialty) {
    rel.push({
      w: 28,
      header: 'Specialty',
      cell: (c: CaseRow) => tableSpecialtyLabel(c),
    });
  }
  if (includeTrust) {
    rel.push({ w: 36, header: 'Trust', cell: (c: CaseRow) => c.hospital?.trim() || '—' });
  }
  rel.push({ w: opW, header: 'Operation', cell: (c: CaseRow) => formatOperationTags(c.operation) });
  if (includeCepod) {
    rel.push({ w: 18, header: 'CEPOD', cell: (c: CaseRow) => c.cepod?.trim() || '—' });
  }
  rel.push(
    { w: 38, header: 'Consultant', cell: (c: CaseRow) => formatConsultant(parseConsultant(c.consultant)) },
    { w: 22, header: 'Role', cell: (c: CaseRow) => c.role?.trim() || '—' },
  );
  if (includeNotes) {
    rel.push({ w: 47, header: 'Notes', cell: (c: CaseRow) => (c.notes?.trim() ? c.notes.trim() : '—') });
  }
  const sum = rel.reduce((a, x) => a + x.w, 0);
  const scaled = rel.map((x) => ({ w: (x.w / sum) * tableWidth, header: x.header, cell: x.cell }));
  const drift = tableWidth - scaled.reduce((a, c) => a + c.w, 0);
  scaled[scaled.length - 1]!.w += drift;
  return scaled;
}

function drawCaseTable(
  ctx: PdfContext,
  cases: CaseRow[],
  yStart: number,
  tableWidth: number,
  columnFlags: CaseTableColumnFlags,
  signOffReserveMm: number,
): number {
  const { doc } = ctx;
  const cols = buildCaseTableColumns(tableWidth, columnFlags);
  const pad = PDF_TABLE_CELL_PAD;
  const bodySize = ctx.s(6.2);
  const headSize = ctx.s(6.5);
  let y = yStart;
  const maxBottom = tableContentMaxBottom(ctx, signOffReserveMm);

  const x0 = ctx.margin;
  const colWidths = cols.map((c) => c.w);

  function rowHeight(cellLines: string[][], isHeader: boolean): number {
    return pdfGridRowHeight(doc, cellLines, isHeader, pad, bodySize, headSize);
  }

  function drawRow(cellLines: string[][], isHeader: boolean, drawTopEdge: boolean): number {
    return drawPdfGridRow(ctx, x0, y, tableWidth, colWidths, cellLines, {
      isHeader,
      drawTopEdge,
      pad,
      bodySize,
      headSize,
    });
  }

  const headLines = cols.map((c) => doc.splitTextToSize(c.header, c.w - pad * 2));
  const headH = rowHeight(headLines, true);
  if (y + headH > maxBottom) {
    y = newPage(ctx);
  }
  y += drawRow(headLines, true, true);

  doc.setFont(ctx.fontFamily, 'normal');
  for (const c of cases) {
    doc.setFontSize(bodySize);
    const cellStr = cols.map((col) => col.cell(c));
    const cellLines = cols.map((col, i) => doc.splitTextToSize(cellStr[i]!, col.w - pad * 2));
    const rh = rowHeight(cellLines, false);
    if (y + rh > maxBottom) {
      y = newPage(ctx);
    }
    y += drawRow(cellLines, false, false);
  }

  return y;
}

/**
 * Specialty × role case counts on a fresh section (caller should start on a new page when needed).
 * Same trainee/header block as the case-list pages, then the consolidation title and table.
 * Repeats column headers after each internal page break (header block is not repeated on those pages).
 */
function drawConsolidationReport(
  ctx: PdfContext,
  cases: CaseRow[],
  yStart: number,
  signOffReserveMm: number,
  prefs: Preferences,
  grade: string | null,
  dateFrom: string,
  dateTo: string,
  includeGmc: boolean,
  includeGrade: boolean,
  headerNotes: string[],
  casesInRange: CaseRow[],
): number {
  const { specialties, roles, countAt } = buildSpecialtyRoleMatrix(cases);
  if (specialties.length === 0 || roles.length === 0) return yStart;

  const { doc } = ctx;
  let y = drawReportHeader(
    ctx,
    prefs,
    grade,
    dateFrom,
    dateTo,
    includeGmc,
    includeGrade,
    headerNotes,
    casesInRange,
    yStart,
  );

  const tableW = ctx.pageW - ctx.margin * 2;
  const x0 = ctx.margin;
  const pad = PDF_TABLE_CELL_PAD;
  const bodySize = ctx.s(6.2);
  const headSize = ctx.s(6.5);

  const maxBottom = () => tableContentMaxBottom(ctx, signOffReserveMm);

  const wSpec = Math.min(58, Math.max(36, tableW * 0.27));
  const colWidths: number[] = [wSpec];
  const eachRoleW = (tableW - wSpec) / roles.length;
  for (let i = 0; i < roles.length; i++) {
    colWidths.push(eachRoleW);
  }
  colWidths[colWidths.length - 1]! += tableW - colWidths.reduce((a, b) => a + b, 0);

  function rowHeightLines(lines: string[][], isHeader: boolean): number {
    return pdfGridRowHeight(doc, lines, isHeader, pad, bodySize, headSize);
  }

  function emitTitle(): void {
    const titleLineH = ctx.g(9);
    const gapBelowTitle = ctx.g(6);
    const blockH = titleLineH + gapBelowTitle;
    while (y + blockH > maxBottom()) {
      y = newPage(ctx);
    }
    doc.setFont(ctx.fontFamily, 'bold');
    doc.setFontSize(ctx.s(12));
    doc.setTextColor(...RGB_SLATE);
    doc.text('Consolidation report', x0, y + ctx.s(12) * 0.85);
    y += blockH;
  }

  function headerLines(): string[][] {
    const innerSpec = Math.max(6, wSpec - pad * 2);
    const lines: string[][] = [doc.splitTextToSize('Specialty', innerSpec)];
    for (let i = 0; i < roles.length; i++) {
      const cw = colWidths[i + 1]!;
      lines.push(doc.splitTextToSize(roles[i]!, Math.max(4, cw - pad * 2)));
    }
    return lines;
  }

  function emitColumnHeader(drawTopEdge: boolean): void {
    const lines = headerLines();
    const h = rowHeightLines(lines, true);
    while (y + h > maxBottom()) {
      y = newPage(ctx);
    }
    y += drawPdfGridRow(ctx, x0, y, tableW, colWidths, lines, {
      isHeader: true,
      drawTopEdge: drawTopEdge,
      pad,
      bodySize,
      headSize,
    });
  }

  emitTitle();
  emitColumnHeader(true);

  for (const spec of specialties) {
    const innerSpec = Math.max(6, wSpec - pad * 2);
    const lines: string[][] = [doc.splitTextToSize(spec, innerSpec)];
    for (let i = 0; i < roles.length; i++) {
      const cw = colWidths[i + 1]!;
      const inner = Math.max(4, cw - pad * 2);
      const n = countAt(spec, roles[i]!);
      lines.push(doc.splitTextToSize(String(n), inner));
    }
    const h = rowHeightLines(lines, false);
    while (y + h > maxBottom()) {
      y = newPage(ctx);
      emitColumnHeader(true);
    }
    y += drawPdfGridRow(ctx, x0, y, tableW, colWidths, lines, {
      isHeader: false,
      drawTopEdge: false,
      pad,
      bodySize,
      headSize,
    });
  }

  const innerSpec = Math.max(6, wSpec - pad * 2);
  const roleTotals = roles.map((role) =>
    specialties.reduce((sum, spec) => sum + countAt(spec, role), 0),
  );
  const totalLines: string[][] = [
    doc.splitTextToSize(`Total (${cases.length})`, innerSpec),
    ...roleTotals.map((n, i) => {
      const cw = colWidths[i + 1]!;
      const inner = Math.max(4, cw - pad * 2);
      return doc.splitTextToSize(String(n), inner);
    }),
  ];
  const totalH = rowHeightLines(totalLines, false);
  while (y + totalH > maxBottom()) {
    y = newPage(ctx);
    emitColumnHeader(true);
  }
  y += drawPdfGridRow(ctx, x0, y, tableW, colWidths, totalLines, {
    isHeader: false,
    drawTopEdge: false,
    pad,
    bodySize,
    headSize,
  });

  return y;
}

/**
 * Trainee declaration + full supervisor sign-off (title, name/GMC/role/date row, signature + comments panels).
 * Final page only; continuation pages use the condensed strip drawn inside `newPage` before `addPage`.
 */
function drawSignOffAtPageBottom(ctx: PdfContext): void {
  const { doc } = ctx;
  const p = doc.getNumberOfPages();
  doc.setPage(p);

  const left = ctx.margin;
  const w = ctx.pageW - ctx.margin * 2;
  const bottom = ctx.pageH - ctx.margin;

  const m = computeSignOffLayout(ctx);
  const boxTop = bottom - m.boxH;
  /** Matches bottom − totalMm: last line ends declGapAboveBox above the sign-off box. */
  const firstDeclY = boxTop - m.declGapAboveBox - m.declLines.length * m.declLineH;

  doc.setFont(ctx.fontFamily, 'normal');
  doc.setFontSize(ctx.s(8));
  doc.setTextColor(...RGB_MUTED);
  const declCenterX = ctx.pageW / 2;
  let declY = firstDeclY;
  for (const ln of m.declLines) {
    doc.text(ln, declCenterX, declY, { align: 'center' });
    declY += m.declLineH;
  }
  doc.setDrawColor(...RGB_BOX_BORDER);
  doc.setLineWidth(0.45);
  doc.rect(left, boxTop, w, m.boxH, 'S');

  let iy = boxTop + m.pad;
  const innerW = w - m.pad * 2;
  const commentsW = innerW - m.sigW - m.twinGap;

  doc.setFont(ctx.fontFamily, 'bold');
  doc.setFontSize(ctx.s(8.5));
  doc.setTextColor(...RGB_SLATE);
  doc.text('Supervisor sign-off', left + m.pad, iy + ctx.s(8.5) * 0.32);
  iy += m.titleH + m.intraGap;

  const rowTop = iy;
  const x0 = left + m.pad;
  const labelY = rowTop + ctx.s(8.5) * 0.34;
  let cx = x0;
  doc.setFont(ctx.fontFamily, 'normal');
  doc.setTextColor(...RGB_MUTED);

  doc.setFontSize(ctx.s(8.5));
  doc.text('Name', cx, labelY);
  cx += m.nameColW + m.colGap;

  doc.setFontSize(ctx.s(7.8));
  doc.text('GMC', cx, labelY);
  cx += m.gmcColW + m.colGap;

  doc.setFontSize(ctx.s(7.8));
  doc.text('Role', cx, labelY);
  cx += m.roleColW + m.colGap;

  doc.setFontSize(ctx.s(7.8));
  doc.text('Date', cx, labelY);

  const lineY = rowTop + m.firstRowH - 1.25;
  doc.setDrawColor(...RGB_BORDER);
  doc.setLineWidth(0.28);
  cx = x0;
  doc.line(cx, lineY, cx + m.nameColW, lineY);
  cx += m.nameColW + m.colGap;
  doc.line(cx, lineY, cx + m.gmcColW, lineY);
  cx += m.gmcColW + m.colGap;
  doc.line(cx, lineY, cx + m.roleColW, lineY);
  cx += m.roleColW + m.colGap;
  doc.line(cx, lineY, cx + m.dateColW, lineY);

  iy = rowTop + m.firstRowH + m.intraGap;

  const sigX = left + m.pad;
  const comX = sigX + m.sigW + m.twinGap;
  doc.setFillColor(...RGB_HEADER_BG);
  doc.rect(sigX, iy, m.sigW, m.twinH, 'F');
  doc.rect(comX, iy, commentsW, m.twinH, 'F');
  doc.setDrawColor(...RGB_BORDER);
  doc.setLineWidth(0.28);
  doc.rect(sigX, iy, m.sigW, m.twinH, 'S');
  doc.rect(comX, iy, commentsW, m.twinH, 'S');

  const panelLabelPt = 7.8;
  doc.setFontSize(ctx.s(panelLabelPt));
  doc.setTextColor(...RGB_MUTED);
  const panelLabelY = iy + ctx.s(panelLabelPt) * 0.42;
  doc.text('Signature', sigX + 1.5, panelLabelY);
  doc.text('Comments', comX + 1.5, panelLabelY);
}

export function buildTrainingReportPdf(opts: ReportPdfOptions): void {
  const {
    prefs,
    grade,
    cases,
    dateFrom,
    dateTo,
    layout,
    includeGmc,
    includeGrade,
    fontFamily,
    fontSizePreset,
    includeConsolidationReport = true,
    headerNotes = [],
  } = opts;
  const filtered = cases.filter((c) => inRange(c, dateFrom, dateTo));
  const sorted = [...filtered].sort((a, b) => a.case_date.localeCompare(b.case_date));

  const scale = scaleForPreset(fontSizePreset);
  const s = (pt: number) => Math.max(6, Math.round(pt * scale * 10) / 10);
  const g = (gap: number) => Math.max(2.8, Math.round(gap * scale * 10) / 10);

  const useLandscape = layout === 'landscape';
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: useLandscape ? 'landscape' : 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = useLandscape ? 12 : 14;

  const ctx: PdfContext = { doc, pageW, pageH, margin, fontFamily, s, g };

  const signOffReserveMm = measureSignOffReserveMm(ctx);

  let y = margin;

  y = drawReportHeader(ctx, prefs, grade, dateFrom, dateTo, includeGmc, includeGrade, headerNotes, filtered, y);

  const tableFloorReserve = signOffReserveMm;
  const minTableHead = 14;
  if (y + minTableHead > tableContentMaxBottom(ctx, tableFloorReserve)) {
    y = newPage(ctx);
  }
  const tableW = pageW - margin * 2;
  drawCaseTable(ctx, sorted, y, tableW, STANDARD_REPORT_COLUMN_FLAGS, signOffReserveMm);

  if (includeConsolidationReport && sorted.length > 0) {
    const yConsolidation = newPage(ctx);
    drawConsolidationReport(
      ctx,
      sorted,
      yConsolidation,
      signOffReserveMm,
      prefs,
      grade,
      dateFrom,
      dateTo,
      includeGmc,
      includeGrade,
      headerNotes,
      filtered,
    );
  }

  drawSignOffAtPageBottom(ctx);

  const fname = `elogbook-report-${dateFrom}-to-${dateTo}.pdf`;
  doc.save(fname);
}
