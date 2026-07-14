'use client'

import { useMemo } from 'react'
import { BookLogo } from '@/components/BookLogo'
import type { DerbyPlayer } from './HrDerbyTable'
import { SortablePropTable } from './SortablePropTable'
import {
  devig, impliedProb, PLAYER_MARKETS, LEAGUE_MARKET, TOTAL_MARKETS, FT500_MARKET,
  H2H_MARKETS, PROP_LINES, EXACT_RESULT, FINALISTS, DOUBLE_CHANCE, COMBINE_MARKETS,
} from '@/lib/hrDerbyOdds'
import { computeMarketSettlement, type LiveHr, type LiveStatusLike, type MarketOutcome } from '@/lib/hrDerbyLiveCash'

type Outcome = MarketOutcome | undefined

function pct(p: number) { return `${(p * 100).toFixed(1)}%` }
function fmtOdds(o: number) { return o > 0 ? `+${o}` : `${o}` }

function outcomeBg(o: Outcome) {
  if (o === 'won') return 'rgba(34,197,94,0.16)'
  if (o === 'lost') return 'rgba(248,113,113,0.10)'
  if (o === 'void') return 'rgba(234,179,8,0.14)'
  return undefined
}
function outcomeMark(o: Outcome) {
  if (o === 'won') return '✅'
  if (o === 'lost') return '❌'
  if (o === 'void') return '⚠️ VOID'
  return null
}

function statForMarket(p: DerbyPlayer | undefined, statKey?: string): string | null {
  if (!p) return null
  switch (statKey) {
    case 'exitVelo': return `${p.exitVeloAvg.toFixed(1)} mph avg EV`
    case 'longestHr': return `${p.avgHrDistance.toFixed(0)} ft avg HR dist`
    case 'mostHr': return `${p.hrTotal} HR (${p.xhr.toFixed(1)} xHR)`
    case 'recentHr': return `${p.recentHrs} HR last 14d`
    case 'blast': return `${p.blastPct.toFixed(1)}% Blast`
    default: return null
  }
}

function rawStatValue(p: DerbyPlayer | undefined, statKey?: string): number {
  if (!p) return 0
  switch (statKey) {
    case 'exitVelo': return p.exitVeloAvg
    case 'longestHr': return p.avgHrDistance
    case 'mostHr': return p.hrTotal
    case 'recentHr': return p.recentHrs
    case 'blast': return p.blastPct
    default: return 0
  }
}

function MiniPlayer({ name, players }: { name: string; players: Map<string, DerbyPlayer> }) {
  const p = players.get(name)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {p && <img src={p.headshotUrl} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', background: 'var(--surface-2)' }} />}
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{name}</span>
    </span>
  )
}

function PlayerMarketCard({ title, time, options, statKey, players, settlement, lookupKey }: {
  title: string; time?: string; options: { player: string; odds: number }[]; statKey?: string
  players: Map<string, DerbyPlayer>
  settlement?: Map<string, MarketOutcome>
  lookupKey?: (player: string) => string
}) {
  const ranked = devig(options)

  // Flag the single biggest disagreement between the book's own implied
  // favorite and what our real tracked data says — not every row, just
  // whichever player actually leads the relevant stat if that's not already
  // who the market favors.
  let dataLeaderName: string | null = null
  if (statKey) {
    let best = -Infinity
    for (const o of options) {
      const v = rawStatValue(players.get(o.player), statKey)
      if (v > best) { best = v; dataLeaderName = o.player }
    }
    if (best <= 0 || dataLeaderName === ranked[0]?.player) dataLeaderName = null
  }

  return (
    <div className="ss-card" style={{ padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>{title}</p>
        {time && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{time}</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {ranked.map((o, i) => {
          const p = players.get(o.player)
          const stat = statForMarket(p, statKey)
          const flagged = o.player === dataLeaderName
          const outcome: Outcome = lookupKey ? settlement?.get(lookupKey(o.player)) : undefined
          return (
            <div key={o.player} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              padding: '5px 8px', borderRadius: 8, background: outcomeBg(outcome),
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {p && <img src={p.headshotUrl} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', background: 'var(--surface-2)', flexShrink: 0 }} />}
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                    {o.player} {flagged && '❓'} {outcomeMark(outcome)}
                  </p>
                  {stat && <p style={{ fontSize: 10, color: 'var(--text-3)' }}>{stat}</p>}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-1)' }}>{fmtOdds(o.odds)}</p>
                <p style={{ fontSize: 10, color: 'var(--text-3)' }}>{pct(o.prob)}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PairList({ title, pairs, players, connector = 'vs.', settlement, lookupKey }: {
  title: string
  pairs: { a: string; b?: string; odds: number }[]
  players: Map<string, DerbyPlayer>
  connector?: string
  settlement?: Map<string, MarketOutcome>
  lookupKey?: (pr: { a: string; b?: string; odds: number }) => string
}) {
  const sorted = [...pairs].map(p => ({ ...p, prob: impliedProb(p.odds) })).sort((a, b) => b.prob - a.prob)
  return (
    <div className="ss-card" style={{ padding: 14, marginBottom: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', marginBottom: 8 }}>{title}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 6, marginTop: 8, maxHeight: 400, overflowY: 'auto' }}>
        {sorted.map((pr, i) => {
          const outcome: Outcome = lookupKey ? settlement?.get(lookupKey(pr)) : undefined
          return (
            <div key={`${pr.a}-${pr.b}-${i}`} style={{
              display: 'flex', flexDirection: 'column', gap: 4,
              padding: '7px 10px', borderRadius: 8, background: outcomeBg(outcome) ?? 'var(--surface-2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <MiniPlayer name={pr.a} players={players} />
                <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-2)', flexShrink: 0 }}>{fmtOdds(pr.odds)} {outcomeMark(outcome)}</span>
              </div>
              {pr.b && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-3)', width: 22, flexShrink: 0 }}>{connector}</span>
                  <MiniPlayer name={pr.b} players={players} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function HrDerbyOddsPanel({ players, hrs, status }: { players: DerbyPlayer[]; hrs: LiveHr[]; status: LiveStatusLike }) {
  const byName = useMemo(() => new Map(players.map(p => [p.name, p])), [players])
  const settlement = useMemo(() => computeMarketSettlement(hrs, players, status), [hrs, players, status])

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <BookLogo vendor="fanduel" size={22} />
        <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-1)' }}>FanDuel Odds — Tonight's Props</h2>
      </div>

      {PLAYER_MARKETS.map(m => (
        <PlayerMarketCard
          key={m.title} title={m.title} time={m.time} options={m.options} statKey={m.statKey} players={byName}
          settlement={settlement} lookupKey={p => `pm::${m.title}::${p}`}
        />
      ))}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 12 }}>
        <PlayerMarketCard title={LEAGUE_MARKET.title} time={LEAGUE_MARKET.time} options={LEAGUE_MARKET.options} players={byName} />
        <PlayerMarketCard
          title={FT500_MARKET.title} time={FT500_MARKET.time} options={FT500_MARKET.options} players={byName}
          settlement={settlement} lookupKey={p => `ft500::${p}`}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 12 }}>
        {TOTAL_MARKETS.map(m => (
          <PlayerMarketCard
            key={m.title} title={m.title} time={m.time} options={m.options} players={byName}
            settlement={settlement} lookupKey={p => `tot::${m.title}::${p}`}
          />
        ))}
      </div>

      <div className="ss-card" style={{ padding: 14, marginBottom: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', marginBottom: 8 }}>⚔️ Round 1 Head-to-Head — More HRs</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 8 }}>
          {H2H_MARKETS.map((h, i) => {
            const outcomeA = settlement.get(`h2h::${i}::a`)
            const outcomeB = settlement.get(`h2h::${i}::b`)
            return (
              <div key={i} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 4px', borderRadius: 6, background: outcomeBg(outcomeA) }}>
                  <MiniPlayer name={h.a} players={byName} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-2)' }}>{fmtOdds(h.oddsA)} {outcomeMark(outcomeA)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3, padding: '3px 4px', borderRadius: 6, background: outcomeBg(outcomeB) }}>
                  <MiniPlayer name={h.b} players={byName} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-2)' }}>{fmtOdds(h.oddsB)} {outcomeMark(outcomeB)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="ss-card" style={{ padding: 14, marginBottom: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', marginBottom: 8 }}>📊 Player Prop Lines</p>
        <SortablePropTable rows={PROP_LINES.map(pl => {
          const p = byName.get(pl.player)
          let real: number | null = null
          let realLabel = '—'
          if (p) {
            if (pl.label.includes('Longest')) { real = p.avgHrDistance; realLabel = `${p.avgHrDistance.toFixed(0)} ft avg` }
            else if (pl.label.includes('Exit Velocity')) { real = p.exitVeloAvg; realLabel = `${p.exitVeloAvg.toFixed(1)} mph avg` }
            else if (pl.label.includes('Total Home Runs')) { real = p.recentHrs; realLabel = `${p.recentHrs} HR / 14d` }
          }
          // Flag when our real number lands on the opposite side of the line
          // from whichever side the book actually favors (lower odds = favored).
          const overFavored = impliedProb(pl.overOdds) > impliedProb(pl.underOdds)
          const flagged = real !== null && real > 0 && (real > pl.line) !== overFavored
          const overOutcome = settlement.get(`propline::${pl.player}::${pl.label}::over`)
          const underOutcome = settlement.get(`propline::${pl.player}::${pl.label}::under`)
          return { ...pl, real, realLabel, flagged, overOutcome, underOutcome }
        })} />
      </div>

      <PairList title="🥇 Exact Result (Head-to-Head Final)" pairs={EXACT_RESULT.map(e => ({ a: e.a, b: e.b, odds: e.odds }))} players={byName} connector="over" />
      <PairList
        title="🎯 Name the Finalists" pairs={FINALISTS.map(f => ({ a: f.a, b: f.b, odds: f.odds }))} players={byName} connector="vs."
        settlement={settlement} lookupKey={pr => `finalists::${pr.a}::${pr.b}`}
      />
      <PairList
        title="🔀 Double Chance (Either Advances)" pairs={DOUBLE_CHANCE.map(d => ({ a: d.a, b: d.b, odds: d.odds }))} players={byName} connector="or"
        settlement={settlement} lookupKey={pr => `doublechance::${pr.a}::${pr.b}`}
      />

      {COMBINE_MARKETS.map(cm => (
        <PairList
          key={cm.threshold}
          title={`Players to Combine for ${cm.threshold} Home Runs in Round 1`}
          pairs={cm.pairs.map(p => ({ a: p.a, b: p.b, odds: p.odds }))}
          players={byName}
          connector="&"
          settlement={settlement}
          lookupKey={pr => `combine::${cm.threshold}::${pr.a}::${pr.b}`}
        />
      ))}
    </div>
  )
}
