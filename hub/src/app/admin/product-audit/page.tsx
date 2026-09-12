import { ClipboardCheck } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { ProductAuditClient } from './ProductAuditClient'

export const metadata = { title: 'Product Audit | SlipSurge Admin' }

export default function ProductAuditPage() {
  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <AdminPageHeader
        eyebrow="Product system"
        title="Experience audit"
        description="Route-by-route migration status for the shared shell, responsive behavior, system states, interactions, and accessibility."
        icon={ClipboardCheck}
      />
      <ProductAuditClient />
    </div>
  )
}
