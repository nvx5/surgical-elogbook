import type { CaseRow } from './types';

/** Normalized stroke capture (0–1 coordinates in pad space). Version bumps if format changes. */
export const CONSULTANT_SIGNATURE_FORMAT_VERSION = 1;

export type ConsultantSigPoint = { x: number; y: number };

export type ConsultantSignatureData = {
  v: number;
  w: number;
  h: number;
  strokes: ConsultantSigPoint[][];
};

const MAX_STROKES = 48;
const MAX_POINTS_TOTAL = 8000;
const MAX_POINTS_PER_STROKE = 600;

/** jsonb occasionally arrives as a JSON string; unwrap one level (and shallow nested signature strings). */
export function unwrapCaseJson(value: unknown, depth = 0): unknown {
  if (depth > 4) return value;
  if (typeof value === 'string') {
    const t = value.trim();
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try {
        return unwrapCaseJson(JSON.parse(t), depth + 1);
      } catch {
        return value;
      }
    }
    return value;
  }
  return value;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function parseCoord(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return clamp01(raw);
  if (typeof raw === 'string') {
    const x = Number(raw.trim());
    if (Number.isFinite(x)) return clamp01(x);
  }
  return null;
}

function parseFormatVersion(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && /^\s*\d+\s*$/.test(raw)) return Number(raw.trim());
  return null;
}

function parsePositiveDim(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === 'string') {
    const x = Number(raw.trim());
    if (Number.isFinite(x) && x > 0) return x;
  }
  return null;
}

function parsePoint(raw: unknown): ConsultantSigPoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const x = parseCoord(o.x);
  const y = parseCoord(o.y);
  if (x === null || y === null) return null;
  return { x, y };
}

/** Parse a stored signature payload (object saved under `consultant.signature` or legacy column). */
export function parseConsultantSignature(raw: unknown): ConsultantSignatureData | null {
  const unwrapped = unwrapCaseJson(raw);
  if (!unwrapped || typeof unwrapped !== 'object') return null;
  const o = unwrapped as Record<string, unknown>;
  const v = parseFormatVersion(o.v);
  const w = parsePositiveDim(o.w);
  const h = parsePositiveDim(o.h);
  if (v !== CONSULTANT_SIGNATURE_FORMAT_VERSION || w === null || h === null) return null;
  if (!Array.isArray(o.strokes)) return null;
  const strokes: ConsultantSigPoint[][] = [];
  for (const s of o.strokes) {
    if (!Array.isArray(s) || s.length === 0) continue;
    const stroke: ConsultantSigPoint[] = [];
    for (const p of s) {
      const pt = parsePoint(p);
      if (!pt) continue;
      stroke.push(pt);
    }
    if (stroke.length) strokes.push(stroke);
  }
  if (!strokes.length) return null;
  return { v, w, h, strokes };
}

/** Prefer nested `consultant.signature`, then legacy `consultant_signature` column. */
export function signatureFromCaseRow(row: CaseRow): ConsultantSignatureData | null {
  const cons = unwrapCaseJson(row.consultant);
  if (cons && typeof cons === 'object') {
    const nested = parseConsultantSignature(unwrapCaseJson((cons as Record<string, unknown>).signature));
    if (nested) return nested;
  }
  return parseConsultantSignature(row.consultant_signature);
}

export function consultantSignatureIsEmpty(data: ConsultantSignatureData | null | undefined): boolean {
  if (!data?.strokes?.length) return true;
  return data.strokes.every((s) => s.length === 0);
}

/** Trim density/size for JSON storage. */
export function clampSignatureForStorage(data: ConsultantSignatureData): ConsultantSignatureData {
  const strokesIn = data.strokes.slice(0, MAX_STROKES);
  let budget = MAX_POINTS_TOTAL;
  const strokes: ConsultantSigPoint[][] = [];
  for (const s of strokesIn) {
    if (budget <= 0) break;
    const cap = Math.min(s.length, MAX_POINTS_PER_STROKE, budget);
    const slice = s.slice(0, cap);
    if (slice.length) strokes.push(slice);
    budget -= slice.length;
  }
  return {
    v: CONSULTANT_SIGNATURE_FORMAT_VERSION,
    w: data.w,
    h: data.h,
    strokes,
  };
}
