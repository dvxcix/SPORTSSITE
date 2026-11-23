import { AdminGeneralSettings } from '@/components/admin/AdminGeneralSettings'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'

export default function AdminGeneralSettingsPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <AdminPageHeader title="General settings" description="Manage SlipSurge identity, registration and posting defaults." />
      <AdminGeneralSettings />
    </div>
  )
}
