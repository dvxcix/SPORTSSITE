import { BookLogo } from '@/components/BookLogo'
import type { DerbyPlayer } from './HrDerbyTable'
import {
  devig, impliedProb, PLAYER_MARKETS, LEAGUE_MARKET, TOTAL_MARKETS, FT500_MARKET,
  H2H_MARKETS, PROP_LINES, EXACT_RESULT, FINALISTS, DOUBLE_CHANCE, COMBINE_MARKETS,
} from '@/lib/hrDerbyOdds'

function pct(p: number) { return `${(p * 100).toFixed(1)}%` }
function fmtOdds(o: number) { return o > 0 ? `+${o}` : `${o}` }

function statForMarket(p: DerbyPlayer | undefined, statKey?: string): string | null {
  if (!p) return null
  switch (statKey) {
    case 'exitVelo': return `${p.exitVeloAvg.toFixed(1)} mph avg EV`
    case 'longestHr': return `${p.avgHrDistance.toFixed(0)} ft avg HR dist`
    case 'mostHr': return `${p.hrTotal} HR (${p.xhr.toFixed(1)} xHR)`
    case 'recentHr': return `${p.recentHrs} HR last 14d`
    default: return null
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

function PlayerMarketCard({ title, time, options, statKey, players }: {
  title: string; time?: string; options: { player: string; odds: number }[]; statKey?: string
  players: Map<string, DerbyPlayer>
}) {
  const ranked = devig(options)
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
          return (
            <div key={o.player} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              padding: '5px 8px', borderRadius: 8,
              background: i === 0 ? 'var(--accent-dim)' : 'transparent',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {p && <img src={p.headshotUrl} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', background: 'var(--surface-2)', flexShrink: 0 }} />}
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 800, color: i === 0 ? 'var(--accent)' : 'var(--text-1)', whiteSpace: 'nowrap' }}>{o.player}</p>
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

function PairList({ title, subtitle, pairs, players, connector = 'vs.' }: {
  title: string; subtitle?: string
  pairs: { a: string; b?: string; odds: number }[]
  players: Map<string, DerbyPlayer>
  connector?: string
}) {
  const sorted = [...pairs].map(p => ({ ...p, prob: impliedProb(p.odds) })).sort((a, b) => b.prob - a.prob)
  return (
    <div className="ss-card" style={{ padding: 14, marginBottom: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>{title}</p>
      {subtitle && <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>{subtitle}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 4, marginTop: 8, maxHeight: 360, overflowY: 'auto' }}>
        {sorted.map((pr, i) => (
          <div key={`${pr.a}-${pr.b}-${i}`} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
            padding: '5px 8px', borderRadius: 6, background: i === 0 ? 'var(--accent-dim)' : 'var(--surface-2)',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, overflow: 'hidden' }}>
              <MiniPlayer name={pr.a} players={players} />
              {pr.b && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{connector}</span>}
              {pr.b && <MiniPlayer name={pr.b} players={players} />}
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: i === 0 ? 'var(--accent)' : 'var(--text-2)', flexShrink: 0 }}>{fmtOdds(pr.odds)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function HrDerbyOddsPanel({ players }: { players: DerbyPlayer[] }) {
  const byName = new Map(players.map(p => [p.name, p]))

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <BookLogo vendor="fanduel" size={22} />
        <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-1)' }}>FanDuel Odds — Tonight's Props</h2>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 16, maxWidth: 700 }}>
        Every market posted for tonight, with the vig stripped out (devigged implied probability) so you can see the book's real lean — highlighted row is the favorite. Where we track the exact stat a market is asking about, your real season number is shown right under your name.
      </p>

      {PLAYER_MARKETS.map(m => (
        <PlayerMarketCard key={m.title} title={m.title} time={m.time} options={m.options} statKey={m.statKey} players={byName} />
      ))}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 12 }}>
        <PlayerMarketCard title={LEAGUE_MARKET.title} time={LEAGUE_MARKET.time} options={LEAGUE_MARKET.options} players={byName} />
        <PlayerMarketCard title={FT500_MARKET.title} time={FT500_MARKET.time} options={FT500_MARKET.options} players={byName} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 12 }}>
        {TOTAL_MARKETS.map(m => (
          <PlayerMarketCard key={m.title} title={m.title} time={m.time} options={m.options} players={byName} />
        ))}
      </div>

      <div className="ss-card" style={{ padding: 14, marginBottom: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', marginBottom: 8 }}>⚔️ Round 1 Head-to-Head — More HRs</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 8 }}>
          {H2H_MARKETS.map((h, i) => (
            <div key={i} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <MiniPlayer name={h.a} players={byName} />
                <span style={{ fontSize: 12, fontWeight: 800, color: impliedProb(h.oddsA) > impliedProb(h.oddsB) ? 'var(--accent)' : 'var(--text-2)' }}>{fmtOdds(h.oddsA)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                <MiniPlayer name={h.b} players={byName} />
                <span style={{ fontSize: 12, fontWeight: 800, color: impliedProb(h.oddsB) > impliedProb(h.oddsA) ? 'var(--accent)' : 'var(--text-2)' }}>{fmtOdds(h.oddsB)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ss-card" style={{ padding: 14, marginBottom: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', marginBottom: 4 }}>📊 Player Prop Lines</p>
        <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>Your real season number shown next to the line, so you can eyeball whether it's set high or low.</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase' }}>Player</th>
                <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase' }}>Prop</th>
                <th style={{ textAlign: 'center', padding: '8px 10px', fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase' }}>Line</th>
                <th style={{ textAlign: 'center', padding: '8px 10px', fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase' }}>Over</th>
                <th style={{ textAlign: 'center', padding: '8px 10px', fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase' }}>Under</th>
                <th style={{ textAlign: 'center', padding: '8px 10px', fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase' }}>Your Number</th>
              </tr>
            </thead>
            <tbody>
              {PROP_LINES.map((pl, i) => {
                const p = byName.get(pl.player)
                let real: string | number = '—'
                if (p) {
                  if (pl.label.includes('Longest')) real = `${p.avgHrDistance.toFixed(0)} ft avg`
                  else if (pl.label.includes('Exit Velocity')) real = `${p.exitVeloAvg.toFixed(1)} mph avg`
                  else if (pl.label.includes('Total Home Runs')) real = `${p.recentHrs} HR / 14d`
                }
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 10px' }}><MiniPlayer name={pl.player} players={byName} /></td>
                    <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--text-2)' }}>{pl.label}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'center', fontSize: 12, fontWeight: 700 }}>{pl.line}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'center', fontSize: 12 }}>{fmtOdds(pl.overOdds)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'center', fontSize: 12 }}>{fmtOdds(pl.underOdds)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'center', fontSize: 11.5, color: 'var(--accent)', fontWeight: 700 }}>{real}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <PairList title="🥇 Exact Result (Head-to-Head Final)" subtitle="Sorted by implied probability, favorite highlighted" pairs={EXACT_RESULT.map(e => ({ a: e.a, b: e.b, odds: e.odds }))} players={byName} connector="over" />
      <PairList title="🎯 Name the Finalists" pairs={FINALISTS.map(f => ({ a: f.a, b: f.b, odds: f.odds }))} players={byName} connector="vs." />
      <PairList title="🔀 Double Chance (Either Advances)" pairs={DOUBLE_CHANCE.map(d => ({ a: d.a, b: d.b, odds: d.odds }))} players={byName} connector="or" />

      {COMBINE_MARKETS.map(cm => (
        <PairList
          key={cm.threshold}
          title={`Players to Combine for ${cm.threshold} Home Runs in Round 1`}
          pairs={cm.pairs.map(p => ({ a: p.a, b: p.b, odds: p.odds }))}
          players={byName}
          connector="&"
        />
      ))}

      <p style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--text-3)', marginTop: 8 }}>
        Odds via FanDuel, posted for tonight's derby. Probabilities are devigged (normalized) within each market — not a guarantee, just the vig-free read of the book's own line.
      </p>
    </div>
  )
}
