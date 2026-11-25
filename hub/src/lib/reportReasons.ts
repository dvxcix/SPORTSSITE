export const REPORT_REASONS = [
  'Spam or misleading',
  'Harassment or bullying',
  'False pick / misleading record',
  'Inappropriate content',
  'Impersonation',
  'Other',
] as const

export function isReportReason(value: unknown): value is typeof REPORT_REASONS[number] {
  return typeof value === 'string' && (REPORT_REASONS as readonly string[]).includes(value)
}
