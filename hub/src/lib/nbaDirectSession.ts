import 'server-only'
import { openSession, type BBSession } from './browserbase'
import { NbaBrowserBudgetError } from './nbaBrowserBudget'
type DeferredReason = 'deadline' | 'blocked' | 'closed'
class NbaDirectDeferred extends Error { constructor(readonly reason: DeferredReason) { super('NBA session work deferred') } }

// One anonymous, guarded session for a single direct-book cron invocation.
// Tasks take turns and get fresh pages; they never share a persisted login.
export class NbaDirectSession {
  private tail: Promise<void> = Promise.resolve()
  private session: BBSession | undefined
  private blocked = false
  private ended = false
  private watchdog: ReturnType<typeof setTimeout> | undefined
  private releasePromise: Promise<void> | undefined
  private denial: NbaBrowserBudgetError | undefined

  private release(): Promise<void> {
    if (!this.session) return Promise.resolve()
    return this.releasePromise ??= this.session.close()
  }

  async acquire(deadline: number, eligible?: () => boolean): Promise<BBSession> {
    const prior = this.tail
    let unlock!: () => void
    this.tail = new Promise<void>(resolve => { unlock = resolve })
    let waitTimer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([prior, new Promise<never>((_, reject) => { waitTimer = setTimeout(() => reject(new NbaDirectDeferred('deadline')), Math.max(1, deadline - Date.now() - 20_000)) })])
    } catch (error) {
      // Do not release this position until its predecessor has finished: a
      // timed-out waiter must never let another task enter a still-busy lane.
      this.blocked = true
      void prior.then(unlock, unlock)
      throw error
    } finally { if (waitTimer) clearTimeout(waitTimer) }
    try { if (eligible && !eligible()) throw new NbaDirectDeferred('closed') }
    catch (error) { if (!(error instanceof NbaDirectDeferred)) this.blocked = true; unlock(); throw error }
    if (this.ended || this.blocked || deadline - Date.now() < 20_000) {
      unlock()
      if (this.denial) throw this.denial
      throw new NbaDirectDeferred(this.ended || this.blocked ? 'blocked' : 'deadline')
    }
    let page: BBSession['page'] | undefined
    try {
      this.watchdog ??= setTimeout(() => {
        this.blocked = true
        void this.release().catch(() => { console.error('[NBA] cloud session release could not be verified') })
      }, Math.max(1, deadline - Date.now()))
      this.session ??= await openSession({ timeoutSeconds: 300, requestTimeoutMs: 20_000, solveCaptchas: false, verifyRelease: true, geoState: 'NC',
        proxyDomainPattern: '^([a-zA-Z0-9-]+\\.)*(betmgm\\.com|draftkings\\.com)$', metadata: { sport: 'nba', book: 'combined-direct', mode: 'first-market-dom' } })
      if (this.ended || this.blocked || deadline - Date.now() < 20_000) {
        await this.release()
        throw new NbaDirectDeferred(this.ended || this.blocked ? 'blocked' : 'deadline')
      }
      const opening = this.session.page.context().newPage()
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        page = await Promise.race([opening, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Page creation timed out')), Math.max(1, Math.min(5000, deadline - Date.now()))) })])
      } catch (error) {
        void opening.then(late => late.close()).catch(() => {})
        throw error
      } finally { if (timer) clearTimeout(timer) }
      if (this.ended || this.blocked || deadline - Date.now() < 20_000) {
        this.blocked = true
        // Verify remote release even when a page appeared after teardown.
        // The page close is best-effort after that stronger confirmation.
        try { await this.release() }
        finally { void page.close().catch(() => {}) }
        throw new NbaDirectDeferred('blocked')
      }
      const session = this.session
      let released = false
      return { page, sessionId: session.sessionId, close: async () => {
        if (released) return
        released = true
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          const pages = session.page.context().pages().filter(candidate => candidate !== session.page)
          await Promise.race([Promise.all(pages.map(candidate => candidate.close())), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Page cleanup timed out')), 5000) })])
        } catch (error) { this.blocked = true; throw error }
        finally { if (timer) clearTimeout(timer); unlock() }
      } }
    } catch (error) {
      // A failed open/page setup must never trigger another create in this run.
      if (!this.session && error instanceof NbaBrowserBudgetError) this.denial = error
      this.blocked = true
      unlock()
      throw error
    }
  }

  stop() { this.blocked = true }

  deferred(error: unknown): DeferredReason | null { return error instanceof NbaDirectDeferred ? error.reason : null }

  async close() {
    this.ended = true
    if (this.watchdog) clearTimeout(this.watchdog)
    await this.release()
  }
}
