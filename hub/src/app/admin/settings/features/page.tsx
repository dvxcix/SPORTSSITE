import { AdminKeyValueSettings } from '@/components/admin/AdminKeyValueSettings'

const FIELDS = [
  { key: 'feature_marketplace', label: 'Marketplace', type: 'toggle' as const, default: true, hint: 'Hides the nav link and blocks /marketplace for everyone except admins' },
  { key: 'feature_pages', label: 'Pages', type: 'toggle' as const, default: true, hint: 'Hides the nav link and blocks /pages for everyone except admins' },
  { key: 'feature_blog', label: 'Blog / Articles', type: 'toggle' as const, default: true, hint: 'Hides the nav link and blocks /blog for everyone except admins' },
  { key: 'feature_forum', label: 'Forum', type: 'toggle' as const, default: true, hint: 'Hides the nav link and blocks /forum for everyone except admins' },
  { key: 'feature_pro_plan', label: 'SlipSurge Pro Subscriptions', type: 'toggle' as const, default: true, hint: 'Hides "Go Pro" and blocks /pro for everyone except admins' },
  { key: 'feature_groups', label: 'Groups', type: 'toggle' as const, default: true },
  { key: 'feature_events', label: 'Events', type: 'toggle' as const, default: true },
  { key: 'feature_stories', label: 'Stories', type: 'toggle' as const, default: true },
  { key: 'feature_polls', label: 'Polls', type: 'toggle' as const, default: true },
  { key: 'feature_watchlist', label: 'Dugout Watchlist', type: 'toggle' as const, default: true },
]

export default function AdminFeaturesSettingsPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-black text-white mb-1">Feature Flags</h1>
      <p className="text-xs text-zinc-500 mb-6">
        The first five below (Marketplace, Pages, Blog, Forum, Pro) are fully wired: turning one off hides it from the sidebar and blocks the route for everyone except admins, who see a preview banner instead. The rest still just save to site_settings without changing site behavior yet.
      </p>
      <AdminKeyValueSettings fields={FIELDS} />
    </div>
  )
}
