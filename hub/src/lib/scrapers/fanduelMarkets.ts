// FanDuel uses both spelled-out and ordinal wording for this market. Both
// concepts are mandatory: FanDuel also offers a separate "Result of 1st
// Plate Appearance" market whose selections are Single, Walk, Out, etc.
// Matching only the timing phrase would import that different market as
// PA1 home-run odds.
export const FANDUEL_FIRST_PA_HR_SECTION_RE =
  /^(?=.*\bhome\s*run\b)(?=.*\b(?:first|1st)\s+(?:plate\s+appearance|pa)\b).*$/i

export function isFanduelFirstPaHrSection(label: string): boolean {
  return FANDUEL_FIRST_PA_HR_SECTION_RE.test(label)
}
