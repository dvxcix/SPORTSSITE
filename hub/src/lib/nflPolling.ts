/** Serialized, staggered refreshes. No account data is cached. */
export function startNflPolling(refresh: (signal: AbortSignal) => Promise<void>, options: { immediate?: boolean } = {}) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout>
  let running = false
  let failures = 0
  const schedule = (delay?: number) => {
    clearTimeout(timer)
    if (!controller.signal.aborted) timer = setTimeout(run, delay ?? nflPollDelay(failures, Math.random()))
  }
  const run = async () => {
    if (controller.signal.aborted || running) return
    if (document.visibilityState === 'hidden' || navigator.onLine === false) { schedule(); return }
    running = true
    try {
      await refresh(AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]))
      failures = 0
    } catch { failures++ }
    finally { running = false; schedule() }
  }
  const resume = () => {
    if (!running && document.visibilityState !== 'hidden' && navigator.onLine !== false) schedule(1000 + Math.random() * 4000)
  }
  document.addEventListener('visibilitychange', resume)
  window.addEventListener('online', resume)
  schedule(options.immediate ? 0 : undefined)
  return () => {
    controller.abort()
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', resume)
    window.removeEventListener('online', resume)
  }
}

export function nflPollDelay(failures: number, random: number) {
  return Math.min(120000, 30000 * 2 ** Math.min(Math.max(failures, 0), 2)) * (0.9 + random * 0.2)
}
