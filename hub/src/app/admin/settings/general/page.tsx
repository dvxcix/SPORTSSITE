import { AdminGeneralSettings } from '@/components/admin/AdminGeneralSettings'

export default function AdminGeneralSettingsPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold text-[var(--text-1)] mb-6">General Settings</h1>
      <AdminGeneralSettings />
    </div>
  )
}
