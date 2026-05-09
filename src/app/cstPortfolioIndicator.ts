/**
 * CST portfolio procedure-count indicator bands (NHS England guidance).
 * Mirrors the table on the marketing Help page.
 */

/** Matches `TRAINING_GRADES` in constants — pre-core trainees who use CST portfolio case bands. */
const HEADER_CASE_BAND_GRADES = new Set(['Medical student', 'FY1', 'FY2']);

export function gradeShowsCstPortfolioCaseBand(grade: string | null | undefined): boolean {
  return HEADER_CASE_BAND_GRADES.has((grade ?? '').trim());
}

export function cstPortfolioIndicatorFromCaseCount(count: number): 'A' | 'B' | 'C' | 'D' | 'E' {
  if (count >= 40) return 'A';
  if (count >= 30) return 'B';
  if (count >= 20) return 'C';
  if (count >= 11) return 'D';
  return 'E';
}
