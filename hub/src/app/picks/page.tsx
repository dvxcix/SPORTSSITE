import { createClient } from '@/lib/supabase/server'
import { attachUserReactions } from '@/lib/queries'
import { getBlockedEitherWayIds } from '@/lib/blocks'
import { Flame, Plus, Target, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { PostCardClient } from '@/components/social/PostCardClient'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { sportLogoUrl } from '@/lib/sportLogos'
import { PageState } from '@/components/layout/PageState'
import { ProductAction, ProductHero, ProductPageShell, ProductSectionHeader } from '@/components/product/ProductPage'

export const dynamic = 'force-dynamic'

const SPORTS = ['All', 'MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA']

function teamLogo(sport: string, abbr: string): string | null {
  if (!abbr || !['mlb', 'nfl', 'nba', 'nhl', 'soccer'].includes(sport?.toLowerCase())) return null
  return `https://a.espncdn.com/i/teamlogos/${sport.toLowerCase()}/500/${abbr.toLowerCase()}.png`
}

export default async function PicksPage({ searchParams }: { searchParams: Promise<{ sport?: string }> }) {
  const { sport: requestedSport } = await searchParams
  const activeSport = SPORTS.includes(requestedSport ?? '') ? requestedSport! : 'All'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const blockedIds = user ? await getBlockedEitherWayIds(supabase, user.id) : []
  const fields = '*, author:users!posts_author_id_fkey(id, username, display_name, avatar_url, is_verified, account_type, pick_record, tier, beta_access_active)'

  let picksQuery = supabase.from('posts').select(fields).in('post_type', ['pick', 'parlay']).order('created_at', { ascending: false }).limit(30)
  if (activeSport !== 'All') picksQuery = picksQuery.eq('sport', activeSport)
  if (blockedIds.length) picksQuery = picksQuery.not('author_id', 'in', `(${blockedIds.join(',')})`)
  let hotQuery = supabase.from('posts').select(fields).in('post_type', ['pick', 'parlay']).order('created_at', { ascending: false }).limit(40)
  if (activeSport !== 'All') hotQuery = hotQuery.eq('sport', activeSport)
  if (blockedIds.length) hotQuery = hotQuery.not('author_id', 'in', `(${blockedIds.join(',')})`)

  const [{ data: rawPicks }, { data: rawHotPicks }] = await Promise.all([picksQuery, hotQuery])
  const picks = await attachUserReactions(rawPicks ?? [], user?.id)
  const hotPicks = [...(rawHotPicks ?? [])].sort((a, b) => (b.reaction_count ?? 0) - (a.reaction_count ?? 0)).slice(0, 6)

  return (
    <ProductPageShell>
      <ProductHero icon={<TrendingUp size={23} />} eyebrow="Community board" title="Picks" description="Fresh picks and parlays from across the SlipSurge community." status={`${picks.length} recent`} actions={user ? <ProductAction href="/feed"><Plus size={14} /> Post a pick</ProductAction> : undefined} />
      <nav className="ss-picks-filters" aria-label="Filter picks by sport">
        {SPORTS.map(sport => {
          const logo = sportLogoUrl(sport)
          return <Link key={sport} href={sport === 'All' ? '/picks' : `/picks?sport=${sport}`} className={activeSport === sport ? 'is-active' : ''} aria-current={activeSport === sport ? 'page' : undefined}>
            {logo ? <Image src={logo} alt="" width={15} height={15} /> : <Target size={14} />}{sport}
          </Link>
        })}
      </nav>
      {(hotPicks?.length ?? 0) > 0 && <section className="ss-picks-hot">
        <ProductSectionHeader title="Trending picks" meta={`${hotPicks!.length} active`} />
        <div className="ss-picks-hot-rail">
          {hotPicks!.map((post: any) => {
            const pick = post.pick_data ?? {}
            const logo = teamLogo(post.sport, pick.team_abbr ?? pick.pick_team)
            const name = post.author?.display_name || post.author?.username || 'Member'
            return <Link href={`/posts/${post.id}`} key={post.id} className="ss-hot-pick">
              <header><MemberAvatar src={post.author?.avatar_url} name={name} size={28} /><span>{name}</span><Flame size={13} /></header>
              <div>{logo && <Image src={logo} alt="" width={34} height={34} />}<strong>{pick.pick || post.content || 'Community pick'}</strong></div>
              <footer><span>{post.sport}</span><span>{post.reaction_count ?? 0} reactions</span></footer>
            </Link>
          })}
        </div>
      </section>}
      <ProductSectionHeader title={activeSport === 'All' ? 'Latest picks' : `${activeSport} picks`} meta={picks.length ? `${picks.length} shown` : undefined} />
      {picks.length === 0
        ? <PageState kind="empty" title="No picks here yet" message="Be the first to share one with the community." actionLabel={user ? 'Create a post' : 'Sign in'} actionHref={user ? '/feed' : '/auth/login?next=/picks'} />
        : <div className="mx-auto flex max-w-3xl flex-col gap-3">{picks.map((post: any) => <PostCardClient key={post.id} post={post} />)}</div>}
    </ProductPageShell>
  )
}
