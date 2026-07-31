import { ImageResponse } from 'next/og'
import { createClient } from '@/lib/supabase/server'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'

export const revalidate = 0

// Same literal-hex approach as api/share-image/[postId]/route.tsx — Satori
// has no CSS custom property support, so this can't just read globals.css.
const C = {
  bg: '#06070A', surface: '#0C0E13', border: '#1B1E28',
  accent: '#B4FF4D', accentFg: '#0B1600',
  text1: '#F0F2F8', text2: '#8891A8', text3: '#7680A3',
  gold: '#FFB84D',
}

// Same vendor map + favicon paths as the client BookLogo.tsx (BookLogo
// itself isn't importable here — it's a 'use client' module, and every
// export of a client module becomes an opaque client reference when
// imported from a server Route Handler, same reason api/share-image/
// [postId]/route.tsx duplicates it too rather than sharing one file).
const BOOKS: Record<string, { favicon: string; initials: string; bg: string; color: string }> = {
  fanduel:    { favicon: '/sportsbooks/fanduel.ico',    initials: 'FD',  bg: '#1493FF', color: '#fff' },
  draftkings: { favicon: '/sportsbooks/draftkings.png', initials: 'DK',  bg: '#53A318', color: '#fff' },
  betmgm:     { favicon: '/sportsbooks/betmgm.png',     initials: 'MGM', bg: '#B8960C', color: '#000' },
  caesars:    { favicon: '/sportsbooks/caesars.png',    initials: 'CZ',  bg: '#0B4032', color: '#B8960C' },
  betrivers:  { favicon: '/sportsbooks/betrivers.ico',  initials: 'BR',  bg: '#003087', color: '#fff' },
  pinnacle:   { favicon: '/sportsbooks/pinnacle.ico',   initials: 'PIN', bg: '#003087', color: '#fff' },
  williamhill_us: { favicon: '/sportsbooks/caesars.png', initials: 'CZ', bg: '#0B4032', color: '#B8960C' },
  fanatics:   { favicon: '/sportsbooks/fanatics.svg',   initials: 'FAN', bg: '#DA1927', color: '#fff' },
}
function normalizeVendor(v: string): string {
  const k = (v || '').toLowerCase().replace(/[^a-z]/g, '')
  if (k === 'fanduel' || k === 'fd') return 'fanduel'
  if (k === 'draftkings' || k === 'dk') return 'draftkings'
  if (k === 'betmgm' || k === 'mgm') return 'betmgm'
  if (k === 'caesars' || k === 'cz' || k === 'williamhillus' || k === 'williamhill') return 'caesars'
  if (k === 'fanatics' || k === 'fan') return 'fanatics'
  if (k === 'betrivers' || k === 'br') return 'betrivers'
  return k
}
function BookIcon({ book, origin, size }: { book: string; origin: string; size: number }) {
  const info = BOOKS[normalizeVendor(book)]
  if (!info) {
    return (
      <div style={{
        display: 'flex', width: size, height: size, borderRadius: 3, alignItems: 'center', justifyContent: 'center',
        background: '#252936', color: '#8891A8', fontSize: size * 0.5, fontWeight: 800,
      }}>
        {book.slice(0, 2).toUpperCase()}
      </div>
    )
  }
  return <img src={origin + info.favicon} width={size} height={size} style={{ borderRadius: 3, objectFit: 'contain' }} />
}
function fmtOdds(odds: number) {
  return odds > 0 ? `+${odds}` : String(odds)
}

// Same real incident as the pick-share route: satori can't decode WebP, so a
// WebP headshot/avatar falls back to an initials circle instead of throwing
// and failing the whole image.
function isUnsupportedImageFormat(src: string): boolean {
  return /\.webp(\?|$)/i.test(src)
}

function Avatar({ src, name, size, bg }: { src?: string | null; name?: string | null; size: number; bg?: string }) {
  if (src && !isUnsupportedImageFormat(src)) {
    return <img src={src} width={size} height={size} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `1.5px solid ${C.border}` }} />
  }
  return (
    <div style={{
      display: 'flex', width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: bg || 'rgba(180,255,77,0.15)', color: C.accent, fontSize: size * 0.36, fontWeight: 900,
      alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${C.border}`,
    }}>
      {(name || '?')[0]?.toUpperCase()}
    </div>
  )
}

// Fixed per-card footprint (avatar + up to 3 books, wrapping to at most 2
// odds-chip rows) so the outer canvas height can be computed up front —
// ImageResponse needs an exact {width, height}, there's no auto-measure.
// Capping at 3 books keeps every card the same predictable height regardless
// of how many prices a given item actually has on file; this is a curated
// share image, not a full odds dump — the in-app Watchlist panel itself
// still shows every book.
const PAD = 24
const HEADER_H = 30
const HEADER_GAP = 16
const CARD_W = 330
const CARD_H = 108
const GRID_GAP = 12
const STRIP_H = 122
const MAX_BOOKS_SHOWN = 3

function PlayerCard({ item, origin }: { item: any; origin: string }) {
  const books = Object.entries(item.odds_by_book || {}) as [string, number][]
  const sorted = books.length
    ? books.sort((a, b) => Math.abs(a[1]) - Math.abs(b[1])).slice(0, MAX_BOOKS_SHOWN)
    : (item.book && item.odds != null ? [[item.book, item.odds] as [string, number]] : [])
  const teamLogo = getTeamLogoUrl(item.team)

  return (
    <div style={{
      display: 'flex', width: CARD_W, height: CARD_H, background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 13, padding: 12, gap: 10,
    }}>
      <div style={{ display: 'flex', position: 'relative', width: 46, height: 46, flexShrink: 0 }}>
        <Avatar src={item.headshot_url} name={item.player_name} size={46} />
        {teamLogo && (
          <div style={{
            display: 'flex', position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: '50%',
            background: C.surface, border: `2px solid ${C.bg}`, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            <img src={teamLogo} width={13} height={13} style={{ objectFit: 'contain' }} />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: C.text1, letterSpacing: -0.2 }}>{item.player_name}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.text3, letterSpacing: 0.3, marginTop: 1 }}>
          {[item.team, item.position, item.bats && `${item.bats}HB`].filter(Boolean).join(' · ')}
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: C.accent, marginTop: 5 }}>{item.prop_label}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
          {sorted.map(([book, odds], i) => (
            <div key={book} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '2px 7px 2px 4px', borderRadius: 6,
              background: i === 0 ? 'rgba(180,255,77,0.08)' : '#121519',
              border: `1px solid ${i === 0 ? 'rgba(180,255,77,0.4)' : '#252936'}`,
            }}>
              <BookIcon book={book} origin={origin} size={13} />
              <span style={{ fontSize: 10.5, fontWeight: 800, color: i === 0 ? C.accent : C.text1 }}>
                {fmtOdds(odds)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export async function GET(req: Request) {
  const origin = new URL(req.url).origin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Not signed in', { status: 401 })

  const [{ data: profile }, { data: items }] = await Promise.all([
    supabase.from('users').select('username, display_name, avatar_url, is_verified').eq('id', user.id).single(),
    supabase.from('watchlist_items').select('*').eq('user_id', user.id).eq('status', 'pending').order('created_at', { ascending: false }),
  ])

  if (!items || items.length === 0) {
    return new Response('Nothing on your watchlist yet', { status: 404 })
  }

  const width = 720
  const rows = Math.ceil(items.length / 2)
  const gridHeight = rows * CARD_H + (rows - 1) * GRID_GAP
  const cardSectionH = PAD * 2 + HEADER_H + HEADER_GAP + gridHeight
  const height = cardSectionH + STRIP_H

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' }).toUpperCase()

  return new ImageResponse(
    (
      <div style={{ width, height, display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: C.surface, padding: PAD }}>
          <div style={{ display: 'flex', alignItems: 'center', height: HEADER_H }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: C.gold, letterSpacing: 1.7 }}>MY WATCHLIST</span>
            <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 'auto', alignItems: 'flex-end' }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: C.text1 }}>{items.length} ON DECK</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: C.text3, letterSpacing: 0.3, marginTop: 2 }}>TODAY · {today}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: GRID_GAP, marginTop: HEADER_GAP }}>
            {items.map((item: any) => <PlayerCard key={item.id} item={item} origin={origin} />)}
          </div>
        </div>

        {/* Watermark strip — same brand treatment as the pick-share route,
            with wording specific to this feature per direct feedback:
            single-line "Researched on SlipSurge" (not the pick-share's
            two-line "Built on / SlipSurge"), plus the sharer's own profile
            badge alongside it. */}
        <div style={{
          display: 'flex', alignItems: 'center', height: STRIP_H, padding: '0 28px',
          background: `linear-gradient(100deg, ${C.accent} 0%, #9EEB2E 100%)`,
        }}>
          <img src={origin + '/icon-512.png'} width={46} height={46} style={{ borderRadius: 12, flexShrink: 0 }} />
          <span style={{ fontSize: 17, fontWeight: 900, color: C.accentFg, letterSpacing: -0.2, marginLeft: 12 }}>
            Researched on SlipSurge
          </span>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto',
            background: 'rgba(6,7,10,0.85)', borderRadius: 14, padding: '6px 14px 6px 6px',
          }}>
            <Avatar src={profile?.avatar_url} name={profile?.display_name || profile?.username} size={30} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 800, color: '#fff' }}>
                {profile?.display_name || profile?.username || 'SlipSurge member'}
                {profile?.is_verified && (
                  <div style={{ display: 'flex', width: 7, height: 7, borderRadius: '50%', background: C.accent }} />
                )}
              </span>
              <span style={{ fontSize: 10, color: C.text3 }}>@{profile?.username ?? 'slipsurge'}</span>
            </div>
          </div>
        </div>
      </div>
    ),
    { width, height }
  )
}
