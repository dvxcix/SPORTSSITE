import { createClient } from '@/lib/supabase/server'
import { authVisibilityUnavailable } from '@/lib/blocks'
import { LeaderboardClient } from './LeaderboardClient'
import { TrendingUp, Trophy } from 'lucide-react'
import { ProductAction, ProductHero, ProductPageShell } from '@/components/product/ProductPage'
import { loadPublicLeaderboard } from '@/lib/leaderboardServer'

// The page itself is NOT statically cached anymore — every request needs
// the real signed-in viewer to filter blocked users out of a shared
// ranking, and that can't happen behind a page-level ISR cache shared by
// every viewer. The expensive part (querying + ranking every user) still
// gets its own cache below via unstable_cache, at the same 120s interval
// this page used to revalidate at as a whole — so this loses none of the
// original performance, it just moves the cache boundary to exclude the
// one genuinely per-viewer step.
export const revalidate = 0

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authVisibilityUnavailable(authError)) throw new Error('Leaderboard is temporarily unavailable')
  const { users, allSports: visibleSports } = await loadPublicLeaderboard(supabase, user?.id)

  return (
    <ProductPageShell narrow>
      <ProductHero icon={<Trophy size={23} />} eyebrow="Community performance" title="Leaderboard" description="Compare public pick performance across the community, by week and by sport." status={`${users.length} ranked members`} actions={<ProductAction href="/picks"><TrendingUp size={14} />Drop a Pick</ProductAction>} />
      <LeaderboardClient users={users} allSports={visibleSports} />
    </ProductPageShell>
  )
}
