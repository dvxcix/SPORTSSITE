// FanDuel uses both spelled-out and ordinal wording for this market. Keep
// the matcher shared and directly testable because a label-only change can
// otherwise look like a healthy scrape while dropping the whole column.
export const FANDUEL_FIRST_PA_HR_SECTION_RE = /\b(?:first|1st)\s+(?:plate\s+appearance|pa)\b/i

export function isFanduelFirstPaHrSection(label: string): boolean {
  return FANDUEL_FIRST_PA_HR_SECTION_RE.test(label)
}
