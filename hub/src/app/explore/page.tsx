import { unstable_cache } from 'next/cache'
import Link from 'next/link'
import {
  Activity, ArrowRight, BarChart3, Compass, Flame, Gauge, Hash,
  Radar, Search, Sparkles, Star, TrendingUp, Users, Zap,
} from 'lucide-react'
import { fetchScheduleWithRetry } from '@slipsurge/core/mlbSchedule'
import { createClient } from '@/lib/supabase/server'
import { attachUserReactions } from '@/lib/queries'
import { fetchHrFeed } from '@/lib/hrFeed'
import { sportLogoUrl } from '@/lib/sportLogos'
import { PostCardClient } from '@/components/social/PostCardClient'
import { UserBadges } from '@/components/social/UserBadges'
import { FollowButton } from '@/components/social/FollowButton'
import { TierGate } from '@/components/layout/TierGate'

export const revalidate = 60

const POST_WITH_AUTHOR = `*, author:users!posts_author_id_fkey(id, username, display_name, avatar_url, is_verified, account_type, pick_record, tier, beta_access_active)`

// Near-HR events live in the external MLB data project, not SlipSurge's
// primary application database. Keep Explore on the same source and date
// contract as TheDugout so both surfaces always report the same slate.
const MLB_PARTY_URL = 'https://emllcbynioctxkbsdlwp.supabase.co'
async function fetchNearHomeRuns(date: string) {
  const key = process.env.MLB_PARTY_SERVICE_ROLE_KEY
  if (!key) return []
  const params = new URLSearchParams({
    game_date: `eq.${date}`,
    select: 'batter_id,batter_name,pitcher_name,result,exit_velocity,hit_distance,parks_hr_count,home_team,away_team,captured_at',
    order: 'parks_hr_count.desc',
    limit: '200',
  })
  try {
    const response = await fetch(`${MLB_PARTY_URL}/rest/v1/near_hrs?${params}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 30 },
    })
    if (!response.ok) return []
    const rows = await response.json()
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

const getSlateActivity = unstable_cache(async (date: string) => {
  const schedule = await fetchScheduleWithRetry(date, 'probablePitcher,team,linescore,venue')
  const [{ hrFeed }, nearHomeRuns] = await Promise.all([
    fetchHrFeed(schedule),
    fetchNearHomeRuns(date),
  ])
  return {
    schedule,
    homeRuns: hrFeed.sort((a, b) => (b.hr_time || '').localeCompare(a.hr_time || '')),
    nearHomeRuns,
  }
}, ['explore-slate-activity-v3'], { revalidate: 30 })

type ExploreUser = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  is_verified: boolean
  account_type: string
  follower_count: number
  pick_record: { wins: number; losses: number } | null
}

function todayET() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function mlbLogo(teamId: number | undefined) {
  return teamId ? `https://www.mlbstatic.com/team-logos/${teamId}.svg` : null
}

export default async function ExplorePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const date = todayET()
  const oneDayAgo = new Date(new Date().getTime() - 86400000).toISOString()

  const [
    { data: topCappers }, { data: topBettors }, { data: rawTopPosts },
    { data: rawTrendingPicks }, { data: pages }, { data: groups }, slateActivity,
  ] = await Promise.all([
    supabase.from('users').select('id, username, display_name, avatar_url, is_verified, account_type, follower_count, pick_record')
      .eq('is_active_member', true).eq('account_type', 'creator').order('follower_count', { ascending: false }).limit(4),
    supabase.from('users').select('id, username, display_name, avatar_url, is_verified, account_type, follower_count, pick_record')
      .eq('is_active_member', true).neq('account_type', 'creator').order('follower_count', { ascending: false }).limit(4),
    supabase.from('posts').select(POST_WITH_AUTHOR).eq('visibility', 'public')
      .gte('created_at', oneDayAgo).order('reaction_count', { ascending: false }).limit(3),
    supabase.from('posts').select(POST_WITH_AUTHOR).eq('post_type', 'pick').eq('visibility', 'public')
      .gte('created_at', oneDayAgo).order('reaction_count', { ascending: false }).limit(3),
    supabase.from('pages').select('id, slug, name, description, avatar_url, emoji, category, follower_count, is_verified')
      .eq('is_published', true).order('follower_count', { ascending: false }).limit(4),
    supabase.from('groups').select('id, slug, name, description, avatar_url, emoji, sport, member_count')
      .eq('is_public', true).order('member_count', { ascending: false }).limit(4),
    getSlateActivity(date).catch(() => ({ schedule: [], homeRuns: [], nearHomeRuns: [] })),
  ])

  const [topPosts, trendingPicks] = await Promise.all([
    attachUserReactions(rawTopPosts ?? [], user?.id),
    attachUserReactions(rawTrendingPicks ?? [], user?.id),
  ])

  const spotlightUsers = [...(topCappers ?? []), ...(topBettors ?? [])] as ExploreUser[]
  let followingIds = new Set<string>()
  if (user && spotlightUsers.length) {
    const { data } = await supabase.from('follows').select('following_id').eq('follower_id', user.id)
      .in('following_id', spotlightUsers.map(person => person.id))
    followingIds = new Set((data ?? []).map(row => row.following_id))
  }

  const allGames = slateActivity.schedule ?? []
  const homeRuns = slateActivity.homeRuns ?? []
  const nearHomeRuns = slateActivity.nearHomeRuns ?? []
  const games = allGames.slice(0, 8)
  const liveGames = allGames.filter((game: any) => game.status?.abstractGameState === 'Live').length
  const finalGames = allGames.filter((game: any) => game.status?.abstractGameState === 'Final').length
  const sports = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA']

  return (
    <TierGate requiredTier="basic" label="Explore">
      <main className="ss-explore-page">
        <header className="ss-explore-hero">
          <div className="ss-explore-hero-copy">
            <p className="ss-explore-eyebrow"><Radar size={13} /> DISCOVERY DESK</p>
            <h1>Explore SlipSurge</h1>
            <p>Follow today&apos;s action, find new voices, and open the tools shaping the conversation.</p>
          </div>
          <Link href="/search" className="ss-explore-search"><Search size={16} /> Search SlipSurge</Link>
          <div className="ss-explore-pulse" aria-label="Today's activity summary">
            <Metric value={allGames.length} label="MLB games" />
            <Metric value={liveGames} label="Live now" live={liveGames > 0} />
            <Metric value={homeRuns.length} label="Home runs" />
            <Metric value={nearHomeRuns.length} label="Near home runs" />
          </div>
        </header>

        <nav className="ss-explore-sports" aria-label="Browse by sport">
          {sports.map(sport => (
            <Link key={sport} href={`/hashtag/${sport.toLowerCase()}`} className="ss-explore-sport">
              {sportLogoUrl(sport) ? <img src={sportLogoUrl(sport)!} alt="" /> : <Hash size={18} />}
              <span>{sport}</span>
              <ArrowRight size={13} />
            </Link>
          ))}
        </nav>

        <div className="ss-explore-layout">
          <div className="ss-explore-main">
            <SectionHeader icon={<Activity size={16} />} eyebrow="TODAY" title="Around the slate" href="/dugout" linkLabel="Open The Dugout" />
            <div className="ss-explore-games">
              {games.length ? games.map((game: any) => <GameDiscoveryCard key={game.gamePk} game={game} />) : (
                <EmptyCard title="No MLB games scheduled" detail="The next slate will appear here when it is available." />
              )}
            </div>

            <div className="ss-explore-event-grid">
              <EventBoard
                className="is-hot" icon={<Flame size={17} />} title="Home runs today" href="/daily-recap"
                empty="No confirmed home runs yet."
                items={homeRuns.slice(0, 6).map((hr: any) => ({
                  id: `${hr.game_pk}-${hr.mlb_id}`, playerId: hr.mlb_id, name: hr.player_name,
                  meta: `off ${hr.pitcher_name || 'opposing pitcher'}`,
                  value: hr.exit_velocity ? `${hr.exit_velocity} mph` : hr.hit_distance ? `${hr.hit_distance} ft` : 'HR',
                }))}
              />
              <EventBoard
                className="is-near" icon={<Gauge size={17} />} title="Near home runs" href="/dugout"
                empty="No near home runs recorded yet."
                items={nearHomeRuns.slice(0, 6).map((near: any, index: number) => ({
                  id: `${near.batter_id}-${index}`, playerId: near.batter_id, name: near.batter_name,
                  meta: `${near.result || 'In play'} · ${near.away_team || ''}${near.away_team && near.home_team ? ' at ' : ''}${near.home_team || ''}`,
                  value: near.parks_hr_count != null ? `${near.parks_hr_count}/30 parks` : near.hit_distance ? `${near.hit_distance} ft` : 'Near HR',
                }))}
              />
            </div>

            {trendingPicks.length > 0 && (
              <section className="ss-explore-section">
                <SectionHeader icon={<TrendingUp size={16} />} eyebrow="COMMUNITY" title="Picks gaining attention" href="/feed?filter=picks" linkLabel="View all picks" />
                <div className="ss-explore-posts">{trendingPicks.map((post: any, index: number) => <PostCardClient key={post.id} post={post} index={index} />)}</div>
              </section>
            )}

            {topPosts.length > 0 && (
              <section className="ss-explore-section">
                <SectionHeader icon={<Sparkles size={16} />} eyebrow="TRENDING" title="Worth opening" href="/feed?filter=top" linkLabel="See the feed" />
                <div className="ss-explore-posts">{topPosts.map((post: any, index: number) => <PostCardClient key={post.id} post={post} index={index} />)}</div>
              </section>
            )}
          </div>

          <aside className="ss-explore-rail">
            <ToolCard />
            <Directory title="Pages to follow" icon={<Star size={15} />} href="/pages" rows={(pages ?? []).map((page: any) => ({
              id: page.id, href: `/pages/${page.slug}`, name: page.name, detail: page.category || `${page.follower_count ?? 0} followers`, image: page.avatar_url, fallback: page.emoji || '★',
            }))} />
            <Directory title="Groups to discover" icon={<Users size={15} />} href="/groups" rows={(groups ?? []).map((group: any) => ({
              id: group.id, href: `/groups/${group.slug}`, name: group.name, detail: group.sport || `${group.member_count ?? 0} members`, image: group.avatar_url, fallback: group.emoji || 'G',
            }))} />
            {(topCappers?.length ?? 0) > 0 && <PeopleSection title="Creators to watch" users={topCappers as ExploreUser[]} currentUserId={user?.id ?? null} followingIds={followingIds} />}
            {(topBettors?.length ?? 0) > 0 && <PeopleSection title="Community standouts" users={topBettors as ExploreUser[]} currentUserId={user?.id ?? null} followingIds={followingIds} />}
            <p className="ss-explore-rail-note">{finalGames ? `${finalGames} game${finalGames === 1 ? '' : 's'} final today.` : 'Live activity updates throughout the slate.'}</p>
          </aside>
        </div>
      </main>
    </TierGate>
  )
}

function Metric({ value, label, live = false }: { value: number; label: string; live?: boolean }) {
  return <div className="ss-explore-metric"><strong>{live ? <span className="ss-live-dot" /> : null}{value}</strong><span>{label}</span></div>
}

function SectionHeader({ icon, eyebrow, title, href, linkLabel }: { icon: React.ReactNode; eyebrow: string; title: string; href: string; linkLabel: string }) {
  return <div className="ss-explore-section-head"><div><p>{icon}{eyebrow}</p><h2>{title}</h2></div><Link href={href}>{linkLabel}<ArrowRight size={13} /></Link></div>
}

function GameDiscoveryCard({ game }: { game: any }) {
  const away = game.teams?.away
  const home = game.teams?.home
  const state = game.status?.abstractGameState
  const live = state === 'Live'
  const final = state === 'Final'
  const time = game.gameDate ? new Date(game.gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) : 'TBD'
  return (
    <Link href="/dugout" className={`ss-explore-game ${live ? 'is-live' : ''}`}>
      <div className="ss-explore-game-state">{live ? <><span className="ss-live-dot" /> LIVE</> : final ? 'FINAL' : time}</div>
      <div className="ss-explore-team"><img src={mlbLogo(away?.team?.id) || ''} alt="" /><span>{away?.team?.name || 'Away'}</span>{(live || final) && <b>{away?.score ?? 0}</b>}</div>
      <div className="ss-explore-team"><img src={mlbLogo(home?.team?.id) || ''} alt="" /><span>{home?.team?.name || 'Home'}</span>{(live || final) && <b>{home?.score ?? 0}</b>}</div>
      <div className="ss-explore-game-foot"><span>{game.venue?.name || 'MLB'}</span><ArrowRight size={13} /></div>
    </Link>
  )
}

function EventBoard({ className, icon, title, href, items, empty }: { className: string; icon: React.ReactNode; title: string; href: string; items: { id: string; playerId: number; name: string; meta: string; value: string }[]; empty: string }) {
  return <section className={`ss-explore-events ${className}`}><div className="ss-explore-events-head"><span>{icon}{title}</span><Link href={href}>Open <ArrowRight size={12} /></Link></div><div className="ss-explore-event-list">{items.length ? items.map(item => <Link href={`/players/${item.playerId}`} key={item.id} className="ss-explore-event"><img src={`https://img.mlbstatic.com/mlb-photos/image/upload/w_80,q_auto:best/v1/people/${item.playerId}/headshot/67/current`} alt="" /><div><strong>{item.name}</strong><span>{item.meta}</span></div><b>{item.value}</b></Link>) : <p className="ss-explore-event-empty">{empty}</p>}</div></section>
}

function ToolCard() {
  return <section className="ss-explore-tool"><p><Zap size={13} /> RESEARCH TOOLKIT</p><h2>Go beyond the surface.</h2><span>Track market movement, compare the full board, and open advanced daily research.</span><div><Link href="/odds-terminal"><BarChart3 size={14} /> Odds Terminal</Link><Link href="/pricing">Compare plans <ArrowRight size={13} /></Link></div></section>
}

function Directory({ title, icon, href, rows }: { title: string; icon: React.ReactNode; href: string; rows: { id: string; href: string; name: string; detail: string; image: string | null; fallback: string }[] }) {
  if (!rows.length) return null
  return <section className="ss-explore-directory"><div className="ss-explore-directory-head"><span>{icon}{title}</span><Link href={href}>See all</Link></div>{rows.map(row => <Link href={row.href} key={row.id} className="ss-explore-directory-row"><div>{row.image ? <img src={row.image} alt="" /> : row.fallback}</div><span><strong>{row.name}</strong><small>{row.detail}</small></span><ArrowRight size={12} /></Link>)}</section>
}

function EmptyCard({ title, detail }: { title: string; detail: string }) {
  return <div className="ss-explore-empty"><Compass size={22} /><strong>{title}</strong><span>{detail}</span></div>
}

function PeopleSection({ title, users, currentUserId, followingIds }: { title: string; users: ExploreUser[]; currentUserId: string | null; followingIds: Set<string> }) {
  return <section className="ss-explore-people"><div className="ss-explore-directory-head"><span><Users size={15} />{title}</span><Link href="/leaderboard">See all</Link></div>{users.map(person => <div key={person.id} className="ss-explore-person"><Link href={`/profile/${person.username}`} className="ss-explore-person-avatar">{person.avatar_url ? <img src={person.avatar_url} alt="" /> : (person.display_name || person.username)[0].toUpperCase()}</Link><div><span><Link href={`/profile/${person.username}`}>{person.display_name || person.username}</Link><UserBadges userId={person.id} size={12} maxVisible={2} /></span><small>@{person.username} · {person.follower_count ?? 0} followers</small></div>{currentUserId && currentUserId !== person.id ? <FollowButton currentUserId={currentUserId} targetUserId={person.id} initialFollowing={followingIds.has(person.id)} /> : null}</div>)}</section>
}
