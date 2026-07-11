import { createClient } from '@/lib/supabase/server'
import { TrendingUp, Plus } from 'lucide-react'
import Link from 'next/link'
import { PostCardClient } from '@/components/social/PostCardClient'

export const dynamic = 'force-dynamic'

// ESPN CDN team logo helper — constructs logo URL from sport + abbreviation
function espnTeamLogo(sport: string, abbr: string): string | null {
  if (!abbr) return null
  const sportPath: Record<string, string> = {
    mlb: 'mlb', nfl: 'nfl', nba: 'nba', nhl: 'nhl', soccer: 'soccer'
  }
  const path = sportPath[sport?.toLowerCase()]
  if (!path) return null
  return `https://a.espncdn.com/i/teamlogos/${path}/500/${abbr.toLowerCase()}.png`
}

export default async function PicksPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string }>
}) {
  const { sport: sportParam } = await searchParams
  const activeSport = sportParam ?? 'All'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Parlays are picks too (multi-leg instead of single) — filtering to only
  // post_type 'pick' was silently excluding every parlay post from this page
  // (they still showed up on the poster's own profile and in live-score
  // play-by-play, which don't filter by post_type at all).
  let picksQuery = supabase
    .from('posts')
    .select('*, author:users(id, username, display_name, avatar_url, is_verified, account_type, pick_record)')
    .in('post_type', ['pick', 'parlay'])
    .order('created_at', { ascending: false })
    .limit(30)
  if (activeSport !== 'All') picksQuery = picksQuery.eq('sport', activeSport)
  const { data: picks } = await picksQuery

  const { data: hotPicks } = await supabase
    .from('posts')
    .select('*, author:users(id, username, display_name, avatar_url, is_verified, account_type, pick_record)')
    .in('post_type', ['pick', 'parlay'])
    .gte('created_at', new Date(Date.now() - 86400000).toISOString())
    .order('reaction_count', { ascending: false })
    .limit(5)

  const SPORTS = ['All', 'MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA']

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(180,255,77,0.08)', border: '1px solid rgba(180,255,77,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingUp size={18} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>Picks</h1>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>Latest picks from the community</p>
          </div>
        </div>
        {user && (
          <Link href="/feed" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--accent)', color: 'var(--accent-fg)',
            fontSize: 12, fontWeight: 800, padding: '8px 14px', borderRadius: 99, textDecoration: 'none',
          }}>
            <Plus size={13} /> Post Pick
          </Link>
        )}
      </div>

      {/* 🔥 Hot Today */}
      {(hotPicks?.length ?? 0) > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>🔥 Hot Today</p>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {(hotPicks ?? []).map((p: any) => {
              const pd = p.pick_data ?? {}
              const teamLogo = espnTeamLogo(p.sport, pd.team_abbr ?? pd.pick_team)
              const resultColor = pd.result === 'win' ? '#4ade80' : pd.result === 'loss' ? 'var(--red)' : 'var(--border-2)'
              return (
                <div key={p.id} style={{
                  flexShrink: 0, width: 180,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 14, padding: '12px 14px',
                }}>
                  {/* Author row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-dim)', overflow: 'hidden', flexShrink: 0 }}>
                      {p.author?.avatar_url
                        ? <img src={p.author.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'var(--accent)' }}>
                            {(p.author?.display_name || p.author?.username || '?')[0].toUpperCase()}
                          </span>
                      }
                    </div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.author?.display_name || p.author?.username}
                    </p>
                  </div>

                  {/* Team logo + pick */}
                  {(teamLogo || pd.pick) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      {teamLogo && (
                        <img src={teamLogo} alt="" style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />
                      )}
                      {pd.pick && (
                        <span style={{ fontSize: 11, fontWeight: 900, color: resultColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {pd.pick}{pd.line ? ` (${pd.line})` : ''}
                        </span>
                      )}
                    </div>
                  )}

                  <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {p.content}
                  </p>
                  {p.reaction_count > 0 && (
                    <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>❤️ {p.reaction_count}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Sport filter pills */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 20 }}>
        {SPORTS.map(s => {
          const isActive = s === activeSport
          return (
            <Link key={s} href={s === 'All' ? '/picks' : `/picks?sport=${s}`} style={{
              padding: '5px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700,
              background: isActive ? 'var(--accent)' : 'var(--surface)',
              color: isActive ? 'var(--accent-fg)' : 'var(--text-3)',
              border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
              whiteSpace: 'nowrap', flexShrink: 0, textDecoration: 'none',
            }}>
              {s}
            </Link>
          )
        })}
      </div>

      {/* Picks feed */}
      {(picks?.length ?? 0) === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ fontSize: 36, marginBottom: 12 }}>🎯</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>No picks yet</p>
          {user && (
            <Link href="/feed" style={{
              display: 'inline-block', marginTop: 8,
              background: 'var(--accent)', color: 'var(--accent-fg)',
              fontWeight: 800, padding: '10px 20px', borderRadius: 99, fontSize: 13, textDecoration: 'none',
            }}>
              Post a Pick
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(picks ?? []).map((p: any) => <PostCardClient key={p.id} post={p} />)}
        </div>
      )}
    </div>
  )
}
