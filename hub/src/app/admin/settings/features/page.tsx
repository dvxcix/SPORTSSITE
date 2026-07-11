import { AdminKeyValueSettings } from '@/components/admin/AdminKeyValueSettings'

const FIELDS = [
  { key: 'feature_marketplace', label: 'Marketplace', type: 'toggle' as const, default: true, hint: 'Buy/sell listings tab' },
  { key: 'feature_groups', label: 'Groups', type: 'toggle' as const, default: true },
  { key: 'feature_events', label: 'Events', type: 'toggle' as const, default: true },
  { key: 'feature_stories', label: 'Stories', type: 'toggle' as const, default: true },
  { key: 'feature_blog', label: 'Blog / Articles', type: 'toggle' as const, default: true },
  { key: 'feature_polls', label: 'Polls', type: 'toggle' as const, default: true },
  { key: 'feature_watchlist', label: 'Dugout Watchlist', type: 'toggle' as const, default: true },
  { key: 'feature_pro_plan', label: 'SlipSurge Pro Subscriptions', type: 'toggle' as const, default: true },
]

export default function AdminFeaturesSettingsPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-black text-white mb-1">Feature Flags</h1>
      <p className="text-xs text-zinc-500 mb-6">
        These save to site_settings but nothing in the app actually reads them yet to hide/show features — flipping one here won't currently change site behavior. Wiring each flag into its feature is a separate follow-up.
      </p>
      <AdminKeyValueSettings fields={FIELDS} />
    </div>
  )
}
