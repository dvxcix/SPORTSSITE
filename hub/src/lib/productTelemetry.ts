export type ProductEventName = 'route_view' | 'route_ready' | 'action_success' | 'action_failure' | 'slow_interaction' | 'activation'
export type ProductOutcome = 'observed' | 'success' | 'failure' | 'abandoned'

const SESSION_KEY = 'ss:product-session'
const recent = new Map<string, number>()

function sessionId() {
  const stored = window.sessionStorage.getItem(SESSION_KEY)
  if (stored) return stored
  const created = crypto.randomUUID()
  window.sessionStorage.setItem(SESSION_KEY, created)
  return created
}

function deviceClass() {
  const width = window.innerWidth
  if (width < 520) return 'phone'
  if (width < 768) return 'foldable'
  if (width < 1024) return 'tablet'
  if (width < 1920) return 'desktop'
  return 'wide'
}

export function recordProductInteraction(eventName: ProductEventName, options?: { outcome?: ProductOutcome; durationMs?: number; route?: string }) {
  if (typeof window === 'undefined') return
  const route = options?.route || window.location.pathname
  const durationMs = Number.isFinite(options?.durationMs) ? Math.max(0, Math.min(120_000, Math.round(options?.durationMs ?? 0))) : null
  const key = `${eventName}:${options?.outcome || 'observed'}:${route}:${durationMs ?? ''}`
  const now = performance.now()
  if (now - (recent.get(key) ?? -10_000) < 1_500) return
  recent.set(key, now)
  void fetch('/api/telemetry/product', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: sessionId(), eventName, route, outcome: options?.outcome || 'observed', durationMs, deviceClass: deviceClass() }),
    keepalive: true,
  }).catch(() => null)
}
