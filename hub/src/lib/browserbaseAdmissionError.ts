/** A verified denial before a Browserbase session-create request was sent.
 * Never wrap an uncertain create or a failed release in this class: callers
 * may use it to release a shared context lease immediately. */
export type BrowserbaseAdmissionCode =
  | 'paused'
  | 'spend-limit'
  | 'usage-unavailable'
  | 'reservation-unavailable'
  | 'configuration'
  | 'quota-limit'
  | 'session-busy'

export class BrowserbaseAdmissionError extends Error {
  readonly code: BrowserbaseAdmissionCode

  constructor(code: BrowserbaseAdmissionCode) {
    super('Cloud browser admission denied')
    this.name = 'BrowserbaseAdmissionError'
    this.code = code
  }
}
