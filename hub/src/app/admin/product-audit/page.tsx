import { ClipboardCheck } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { ProductAuditClient } from './ProductAuditClient'
import { createAdminClient } from '@/lib/supabase/admin'
import { connection } from 'next/server'
import { summarizeProductTelemetry } from '@/lib/productExperienceTelemetry'

export const metadata = { title: 'Product Audit | SlipSurge Admin' }

export default async function ProductAuditPage() {
  // Private operational data belongs to the authenticated request, not a build.
  await connection()
  const { data: events } = await createAdminClient().from('product_interaction_events')
    .select('route,event_name,outcome,duration_ms,device_class,created_at')
    .order('created_at', { ascending: false })
    .limit(5000)
  const telemetry = summarizeProductTelemetry(events ?? [])
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
