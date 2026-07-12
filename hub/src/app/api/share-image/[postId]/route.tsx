import { ImageResponse } from 'next/og'
import { createClient } from '@/lib/supabase/server'
import { sportLogoUrl } from '@/lib/sportLogos'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'

// BookLogo.tsx's normalizeVendor isn't importable here — it's a 'use client'
// module, and every export of a client module becomes an opaque client
// reference when imported from a server Route Handler, even a plain sync
// function. Small enough to just duplicate rather than extract a shared file.
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

export const revalidate = 0

// Satori (what ImageResponse renders through) has no CSS custom property
// support, so every color here is the literal hex from globals.css instead
// of var(--x) — this is the one place in the app that can't just reference
// the design tokens.
const C = {
  bg: '#06070A', surface: '#0C0E13', border: '#1B1E28',
  accent: '#B4FF4D', accentFg: '#0B1600',
  text1: '#F0F2F8', text2: '#8891A8', text3: '#7680A3',
  red: '#FF4D6A', green: '#2ED573', gold: '#FFB84D',
}

const BOOKS: Record<string, { favicon: string; initials: string; bg: string; color: string }> = {
  fanduel:    { favicon: '/sportsbooks/fanduel.ico',    initials: 'FD',  bg: '#1493FF', color: '#fff' },
  draftkings: { favicon: '/sportsbooks/draftkings.png', initials: 'DK',  bg: '#53A318', color: '#fff' },
  betmgm:     { favicon: '/sportsbooks/betmgm.png',     initials: 'MGM', bg: '#B8960C', color: '#000' },
  caesars:    { favicon: '/sportsbooks/caesars.png',    initials: 'CZ',  bg: '#0B4032', color: '#B8960C' },
  betrivers:  { favicon: '/sportsbooks/betrivers.ico',  initials: 'BR',  bg: '#003087', color: '#fff' },
  pinnacle:   { favicon: '/sportsbooks/pinnacle.ico',   initials: 'PIN', bg: '#003087', color: '#fff' },
  williamhill_us: { favicon: '/sportsbooks/caesars.png', initials: 'CZ', bg: '#0B4032', color: '#B8960C' },
}

function fmtOdds(odds: number | string | null | undefined) {
  if (odds == null) return '—'
  return Number(odds) > 0 ? `+${odds}` : String(odds)
}
function fmtUsd(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function BookMark({ book, origin }: { book?: string | null; origin: string }) {
  if (!book) return null
  const info = BOOKS[normalizeVendor(book)]
  if (!info) return (
    <div style={{ display: 'flex', width: 18, height: 18, borderRadius: 3, background: C.border, color: C.text3, fontSize: 9, fontWeight: 700, alignItems: 'center', justifyContent: 'center' }}>
      {book.slice(0, 2).toUpperCase()}
    </div>
  )
  return <img src={origin + info.favicon} width={18} height={18} style={{ borderRadius: 3, objectFit: 'contain' }} />
}

// Team logo (falling back to the bare abbreviation only for teams with no
// mlbstatic.com mapping) instead of always showing plain text like "PIT" —
// matches how team abbreviations render everywhere else on the site.
function TeamLine({ team, detail, fontSize, color }: { team?: string | null; detail: any; fontSize: number; color: string }) {
  const logo = getTeamLogoUrl(team)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      {logo
        ? <img src={logo} width={fontSize} height={fontSize} style={{ objectFit: 'contain' }} />
        : team && <span style={{ fontSize, color }}>{team}</span>}
      <span style={{ fontSize, color }}>· {detail}</span>
    </div>
  )
}

function Avatar({ src, name, size }: { src?: string | null; name?: string | null; size: number }) {
  if (src) return <img src={src} width={size} height={size} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{
      display: 'flex', width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'rgba(180,255,77,0.15)', color: C.accent, fontSize: size * 0.4, fontWeight: 900,
      alignItems: 'center', justifyContent: 'center',
    }}>
      {(name || '?')[0]?.toUpperCase()}
    </div>
  )
}

export async function GET(req: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params
  const origin = new URL(req.url).origin

  const supabase = await createClient()
  const { data: post } = await supabase.from('posts')
    .select('id, sport, pick_data, author:users(username, display_name, avatar_url, is_verified)')
    .eq('id', postId).eq('visibility', 'public').single()

  const author = Array.isArray(post?.author) ? post?.author[0] : post?.author
  const pd = post?.pick_data as any

  if (!post || !pd) {
    return new Response('No shareable pick on this post', { status: 404 })
  }

  const legs: any[] | null = Array.isArray(pd.legs) ? pd.legs : null
  const result: string | undefined = pd.result
  const width = 720
  const PAD = 28
  const LEG_H = 66
  const LEG_GAP = 10
  const HEADER_H = 34
  const STRIP_H = 132

  let bodyH: number
  if (legs) bodyH = legs.length * LEG_H + (legs.length - 1) * LEG_GAP + 50 /* combined-odds footer */
  else if (pd.mlb_id) bodyH = 60
  else bodyH = 44

  const hasWager = pd.wager_amount != null || pd.potential_payout != null
  const cardH = PAD * 2 + HEADER_H + 14 + bodyH + (hasWager ? 40 : 0)
  const height = cardH + STRIP_H

  const resultColor = result === 'win' ? C.green : result === 'loss' ? C.red : C.text3
  // Plain words, no ✓/✗ glyphs — satori's default font is missing those and
  // renders a tofu box instead; color already carries the win/loss signal.
  const resultLabel = result === 'win' ? 'WIN' : result === 'loss' ? 'LOSS' : result === 'push' ? 'PUSH' : 'PENDING'

  const sportLogo = post.sport ? sportLogoUrl(post.sport) : undefined

  return new ImageResponse(
    (
      <div style={{ width, height, display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: 'sans-serif' }}>
        {/* Pick card */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: C.surface, padding: PAD, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', height: HEADER_H }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: C.gold, letterSpacing: 2 }}>PICK</span>
            {sportLogo && <img src={sportLogo} width={18} height={18} style={{ marginLeft: 10, objectFit: 'contain' }} />}
            <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 800, color: resultColor }}>{resultLabel}</span>
          </div>

          {legs ? (
            // No Fragments here — satori (ImageResponse's renderer) doesn't
            // treat a Fragment's children as real flex-layout boxes, so an
            // outer `<> {legs.map(...)} <footer/> </>` inside a
            // flexDirection:'column' parent rendered every leg row as if it
            // were a column child on its own axis instead of stacking —
            // player rows overlapped instead of listing top-to-bottom. Each
            // branch now returns one real wrapping <div>.
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 14, gap: LEG_GAP }}>
              {legs.map((leg: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', width: '100%', height: LEG_H - LEG_GAP, gap: 12 }}>
                  <Avatar src={leg.headshot_url} name={leg.player_name} size={44} />
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: C.text1 }}>{leg.player_name}</span>
                    <TeamLine team={leg.team} detail={leg.prop_label ?? leg.line} fontSize={14} color={C.text3} />
                  </div>
                  <span style={{ fontSize: 17, fontWeight: 800, color: C.text1, fontFamily: 'monospace' }}>{fmtOdds(leg.odds)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', width: '100%', paddingTop: 14, marginTop: 4, borderTop: `1px solid ${C.border}`, height: 34 }}>
                <BookMark book={pd.book} origin={origin} />
                <span style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 900, color: C.accent, fontFamily: 'monospace' }}>{fmtOdds(pd.combined_odds)}</span>
              </div>
            </div>
          ) : pd.mlb_id ? (
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', marginTop: 14, gap: 14 }}>
              <Avatar src={pd.headshot_url} name={pd.player_name} size={64} />
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: C.text1 }}>{pd.player_name}</span>
                <TeamLine team={pd.team} detail={pd.prop_label ?? pd.line} fontSize={15} color={C.text2} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: C.text1, fontFamily: 'monospace' }}>{fmtOdds(pd.odds)}</span>
                  <BookMark book={pd.book} origin={origin} />
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', marginTop: 14 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: C.text1 }}>{pd.team}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                <span style={{ fontSize: 15, color: C.text2 }}>{pd.line}</span>
                {pd.odds && <span style={{ fontSize: 15, fontWeight: 800, color: C.text1, fontFamily: 'monospace' }}>{fmtOdds(pd.odds)}</span>}
              </div>
            </div>
          )}

          {hasWager && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: C.text3, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
              {pd.wager_amount != null && (
                <span style={{ display: 'flex' }}>Wager&nbsp;<span style={{ color: C.text1, fontWeight: 700 }}>{fmtUsd(Number(pd.wager_amount))}</span></span>
              )}
              {pd.potential_payout != null && (
                <span style={{ display: 'flex' }}>To win&nbsp;<span style={{ color: C.green, fontWeight: 700 }}>{fmtUsd(Number(pd.potential_payout) - Number(pd.wager_amount ?? 0))}</span></span>
              )}
            </div>
          )}
        </div>

        {/* Watermark strip */}
        <div style={{
          display: 'flex', alignItems: 'center', height: STRIP_H, padding: '0 28px',
          background: `linear-gradient(100deg, ${C.accent} 0%, #9EEB2E 100%)`,
        }}>
          <img src={origin + '/icon-512.png'} width={64} height={64} style={{ borderRadius: 14, flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.accentFg, letterSpacing: 2, opacity: 0.75 }}>BUILT ON</span>
            <span style={{ fontSize: 30, fontWeight: 900, color: C.accentFg, letterSpacing: -0.5, lineHeight: 1 }}>SLIPSURGE</span>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto',
            background: 'rgba(6,7,10,0.85)', borderRadius: 14, padding: '10px 16px',
          }}>
            <Avatar src={author?.avatar_url} name={author?.display_name || author?.username} size={40} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 15, fontWeight: 800, color: '#fff' }}>
                {author?.display_name || author?.username || 'SlipSurge'}
                {author?.is_verified && (
                  // A dot instead of a ✓ glyph — satori's default font is
                  // missing that character and renders a tofu box instead.
                  <div style={{ display: 'flex', width: 8, height: 8, borderRadius: '50%', background: C.accent }} />
                )}
              </span>
              <span style={{ fontSize: 13, color: C.text3 }}>@{author?.username ?? 'slipsurge'}</span>
            </div>
          </div>
        </div>
      </div>
    ),
    { width, height }
  )
}
