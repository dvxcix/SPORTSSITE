import { createClient } from '@/lib/supabase/server'
import { attachUserReactions } from '@/lib/queries'
import { authVisibilityUnavailable, getBlockedEitherWayIds } from '@/lib/blocks'
import { Flame, Plus, Target, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { PostCardClient } from '@/components/social/PostCardClient'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { sportLogoUrl } from '@/lib/sportLogos'
import { PageState } from '@/components/layout/PageState'
import { ProductAction, ProductHero, ProductPageShell, ProductSectionHeader } from '@/components/product/ProductPage'
import { EmojiText } from '@/components/social/EmojiText'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { hydrateVisibleAuthorRecords } from '@/lib/visiblePickRecords'
import { ResearchSavedActions } from '@/components/research/ResearchSavedActions'
import { memberTone } from '@/lib/memberIdentity'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { BookLogo } from '@/components/BookLogo'
import { sportTeamColors, sportTeamLogoUrl } from '@/lib/sportTeamArtwork'
import { SafeImage } from '@/components/ui/SafeImage'
import type { CSSProperties } from 'react'

export const dynamic = 'force-dynamic'

const SPORTS = ['All', 'MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA']

function teamLogo(sport: string, abbr: string): string | null {
  if (!abbr || !['mlb', 'nfl', 'nba', 'nhl', 'soccer'].includes(sport?.toLowerCase())) return null
  return `https://a.espncdn.com/i/teamlogos/${sport.toLowerCase()}/500/${abbr.toLowerCase()}.png`
}

export default async function PicksPage({ searchParams }: { searchParams: Promise<{ sport?: string }> }) {
  const { sport: requestedSport } = await searchParams
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authVisibilityUnavailable(authError)) throw new Error('Picks are temporarily unavailable')
  const mlbAccess = await canViewMlb(supabase, user?.id)
  const visibleSports = SPORTS.filter(sport => mlbAccess || sport !== 'MLB')
  const activeSport = visibleSports.includes(requestedSport ?? '') ? requestedSport! : 'All'
  const blockedIds = user ? await getBlockedEitherWayIds(supabase, user.id) : []
  const fields = '*, author:users!posts_author_id_fkey(id, username, display_name, avatar_url, avatar_ring_style, avatar_ring_color, bio, follower_count, is_verified, account_type, tier, beta_access_active)'

  let picksQuery = supabase.from('posts').select(fields).in('post_type', ['pick', 'parlay']).order('created_at', { ascending: false }).limit(30)
  if (activeSport !== 'All') picksQuery = picksQuery.eq('sport', activeSport)
  if (blockedIds.length) picksQuery = picksQuery.not('author_id', 'in', `(${blockedIds.join(',')})`)
  let hotQuery = supabase.from('posts').select(fields).in('post_type', ['pick', 'parlay']).order('created_at', { ascending: false }).limit(40)
  if (activeSport !== 'All') hotQuery = hotQuery.eq('sport', activeSport)
  if (blockedIds.length) hotQuery = hotQuery.not('author_id', 'in', `(${blockedIds.join(',')})`)

  const [{ data: rawPicks }, { data: rawHotPicks }] = await Promise.all([picksQuery, hotQuery])
  const visible = (posts: typeof rawPicks) => (posts ?? []).filter(post => mlbAccess || post.sport?.toUpperCase() !== 'MLB')
  const enrichedPicks = await attachUserReactions(visible(rawPicks), user?.id)
  const { posts: picks } = await hydrateVisibleAuthorRecords(supabase, enrichedPicks)
  const hotPicks = visible(rawHotPicks).sort((a, b) => (b.reaction_count ?? 0) - (a.reaction_count ?? 0)).slice(0, 6)

  return (
    <ProductPageShell className="ss-member-picks-page">
      <ProductHero icon={<TrendingUp size={23} />} title="Picks" description="From the community." actions={user ? <><ResearchSavedActions /><ProductAction href="/feed?pick=true"><Plus size={14} /> Post a pick</ProductAction></> : undefined} />
      <nav className="ss-picks-filters" aria-label="Filter picks by sport">
        {visibleSports.map(sport => {
          const logo = sportLogoUrl(sport)
          return <Link key={sport} href={sport === 'All' ? '/picks' : `/picks?sport=${sport}`} className={activeSport === sport ? 'is-active' : ''} aria-current={activeSport === sport ? 'page' : undefined}>
            {logo ? <Image src={logo} alt="" width={15} height={15} /> : <Target size={14} />}{sport}
          </Link>
        })}
      </nav>
      {(hotPicks?.length ?? 0) > 0 && <section className="ss-picks-hot">
        <ProductSectionHeader title="Trending picks" meta={String(hotPicks!.length)} />
        <div className="ss-picks-hot-rail">
          {hotPicks!.map((post: any) => {
            const pick = post.pick_data ?? {}
            const team = pick.team_abbr ?? pick.pick_team ?? pick.team
            const logo = sportTeamLogoUrl(post.sport, team) ?? teamLogo(post.sport, team)
            const brand = sportTeamColors(post.sport, team)
            const price = pick.combined_odds ?? pick.odds
            const odds = price != null && Number.isFinite(Number(price)) && Math.abs(Number(price)) >= 100 ? `${Number(price)>0?'+':''}${price}` : null
            const player = pick.player_name && (pick.player_id || pick.mlb_id || pick.headshot_url)
            const name = post.author?.display_name || post.author?.username || 'Member'
            return <Link href={`/posts/${post.id}`} key={post.id} className="ss-hot-pick" style={brand ? {'--pick-primary':brand[0],'--pick-secondary':brand[1]} as CSSProperties : undefined}>
              <header><MemberAvatar src={post.author?.avatar_url} name={name} size={28} tone={memberTone(post.author)} ringStyle={post.author?.avatar_ring_style} ringColor={post.author?.avatar_ring_color} /><span>{name}</span><Flame size={13} aria-hidden="true" /></header>
              <div>{player ? <PlayerAvatar sport={post.sport} playerId={pick.player_id ?? pick.mlb_id} headshot={pick.headshot_url} teamAbbr={team} name={pick.player_name} size={44}/> : logo && <SafeImage src={logo} alt={team ?? ''} width={34} height={34} fallback={<span className="ss-hot-team-fallback">{team}</span>}/>}<span className="ss-hot-pick-copy">{player && <strong>{pick.player_name}</strong>}<span><EmojiText text={pick.prop_label || pick.pick || (Array.isArray(pick.legs) ? `${pick.legs.length}-leg parlay` : post.content) || 'Community pick'} /></span></span></div>
              <footer><span>{post.sport}</span>{odds && <span className="ss-hot-pick-price">{pick.book && <BookLogo vendor={pick.book} size={17}/>}<strong>{odds}</strong></span>}{post.reaction_count > 0 && <span>{post.reaction_count} reactions</span>}</footer>
            </Link>
          })}
        </div>
      </section>}
      <ProductSectionHeader title={activeSport === 'All' ? 'Latest picks' : `${activeSport} picks`} meta={picks.length ? String(picks.length) : undefined} />
      {picks.length === 0
        ? <PageState kind="empty" title="No picks here yet" message="Be the first to share one with the community." actionLabel={user ? 'Create a post' : 'Sign in'} actionHref={user ? '/feed' : '/auth/login?next=/picks'} />
        : <div className="mx-auto flex max-w-3xl flex-col gap-3">{picks.map((post: any) => <PostCardClient key={post.id} post={post} />)}</div>}
    </ProductPageShell>
  )
}
