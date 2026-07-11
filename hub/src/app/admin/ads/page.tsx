import { AdminComingSoon } from '@/components/admin/AdminComingSoon'

export default function AdminAdsPage() {
  return (
    <AdminComingSoon
      title="Ads"
      missing="No ad campaigns table exists yet, and no ad-serving logic runs anywhere on the site. This would need its own schema (campaigns, placements, impressions) before there's anything to manage here."
    />
  )
}
