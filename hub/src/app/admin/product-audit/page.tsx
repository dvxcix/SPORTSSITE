import { ClipboardCheck } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { ProductAuditClient } from './ProductAuditClient'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata = { title: 'Product Audit | SlipSurge Admin' }

export default async function ProductAuditPage() {
  const { data: events } = await createAdminClient().from('product_interaction_events')
    .select('route,event_name,outcome,duration_ms,device_class,created_at')
    .order('created_at', { ascending: false })
    .limit(5000)
  const rows = events ?? []
  const durations = rows.map(row => Number(row.duration_ms)).filter(value => Number.isFinite(value) && value >= 0).sort((a, b) => a - b)
  const p95Index = Math.max(0, Math.ceil(durations.length * 0.95) - 1)
  const routeHealth = [...rows.reduce((groups, row) => {
    const route = row.route || '/unknown'
    const current = groups.get(route) ?? { route, events: 0, failures: 0, slow: 0, durations: [] as number[], devices: new Set<string>(), lastSeen: null as string | null }
    current.events += 1
    if (row.outcome === 'failure' || row.event_name === 'action_failure') current.failures += 1
    if (row.event_name === 'slow_interaction') current.slow += 1
    const duration = Number(row.duration_ms)
    if (Number.isFinite(duration) && duration >= 0) current.durations.push(duration)
    if (row.device_class) current.devices.add(row.device_class)
    if (!current.lastSeen || (row.created_at && row.created_at > current.lastSeen)) current.lastSeen = row.created_at
    groups.set(route, current)
    return groups
  }, new Map<string, { route: string; events: number; failures: number; slow: number; durations: number[]; devices: Set<string>; lastSeen: string | null }>()).values()].map(item => {
    const sorted = item.durations.sort((a, b) => a - b)
    const routeP95 = sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] : 0
    return { route: item.route, events: item.events, failures: item.failures, slow: item.slow, p95Ms: routeP95, devices: item.devices.size, lastSeen: item.lastSeen }
  }).sort((a, b) => b.failures - a.failures || b.slow - a.slow || b.p95Ms - a.p95Ms || b.events - a.events).slice(0, 12)
  const telemetry = {
    events: rows.length,
    measuredRoutes: new Set(rows.map(row => row.route)).size,
    failures: rows.filter(row => row.outcome === 'failure' || row.event_name === 'action_failure').length,
    slowInteractions: rows.filter(row => row.event_name === 'slow_interaction').length,
    p95ReadyMs: durations.length ? durations[p95Index] : 0,
    deviceCoverage: new Set(rows.map(row => row.device_class)).size,
    routeHealth,
  }
  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <AdminPageHeader
        eyebrow="Product system"
        title="Experience audit"
        description="Route-by-route migration status for the shared shell, responsive behavior, system states, interactions, and accessibility."
        icon={ClipboardCheck}
      />
      <ProductAuditClient telemetry={telemetry} />
    </div>
  )
}
