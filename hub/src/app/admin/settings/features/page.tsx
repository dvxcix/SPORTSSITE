import { AdminKeyValueSettings } from '@/components/admin/AdminKeyValueSettings'

const FIELDS = [
  { key: 'feature_marketplace', label: 'Marketplace', type: 'toggle' as const, default: true, hint: 'Hides the nav link and blocks /marketplace for everyone except admins' },
  { key: 'feature_pages', label: 'Pages', type: 'toggle' as const, default: true, hint: 'Hides the nav link and blocks /pages for everyone except admins' },
  { key: 'feature_blog', label: 'Blog / Articles', type: 'toggle' as const, default: true, hint: 'Hides the nav link and blocks /blog for everyone except admins' },
  { key: 'feature_forum', label: 'Forum', type: 'toggle' as const, default: true, hint: 'Hides the nav link and blocks /forum for everyone except admins' },
  { key: 'feature_groups', label: 'Groups', type: 'toggle' as const, default: true },
  { key: 'feature_events', label: 'Events', type: 'toggle' as const, default: true, hint: 'Hides the nav link and blocks /events for everyone except admins' },
  { key: 'feature_stories', label: 'Stories', type: 'toggle' as const, default: true },
  { key: 'feature_polls', label: 'Polls', type: 'toggle' as const, default: true },
  { key: 'feature_watchlist', label: 'Dugout Watchlist', type: 'toggle' as const, default: true },
]

export default function AdminFeaturesSettingsPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-black text-white mb-1">Feature Flags</h1>
      <p className="text-xs text-zinc-500 mb-6">
        Marketplace, Pages, Blog, Forum, and Events are fully wired: turning one off hides it from the sidebar and blocks the route for everyone except admins, who see a preview banner instead. Stories is also wired: turning it off hides the story bar from the feed for everyone, with no admin exception. Memberships are managed through Whop and remain available from the pricing and membership pages.
      </p>
      <AdminKeyValueSettings fields={FIELDS} />
    </div>
  )
}
