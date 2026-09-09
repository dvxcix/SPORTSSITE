import type { NflOddsPlayer, NflPlayerMarket, SidelineOddsBoard } from '../nflOddsTypes'

export type FdTab = { scraped_at: string; event: { title: string; url?: string }; sections: Record<string, { parts?: string[]; selection?: string; market_hint?: string; odds: string }[]> }
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

export function nflFdMarket(label: string): { prop: string; category: NflPlayerMarket['category']; line: number | null } | null {
  const s = label.toLowerCase().replace(/\byds\b/g, 'yards').replace(/\btds?\b/g, 'touchdown')
  // Do not silently import period/team/combo markets as full-game individual props.
  if (/quarter|\b[1-4]q\b|\bteam\b|\bdrive\b|\bmost\b|\beither\b|special|each|both|combined|next touchdown|last touchdown/.test(s)) return null
  if (/half/.test(s) && !/(first|1st) half.*touchdown|touchdown.*(first|1st) half/.test(s)) return null
  if (/(first|1st) half/.test(s) && /touchdown/.test(s)) return { prop: 'anytime_td_1h', category: 'touchdowns', line: 0.5 }
  if (/(first|1st).*touchdown/.test(s)) return { prop: 'first_td', category: 'touchdowns', line: 0.5 }
  if (/touchdown/.test(s) && !/pass/.test(s)) {
    const threshold = s.match(/\b([23])\s*(?:\+|or more)/)
    return { prop: threshold ? `${threshold[1] === '2' ? 'two' : 'three'}_plus_td` : 'anytime_td', category: 'touchdowns', line: threshold ? Number(threshold[1]) : 0.5 }
  }
  const rules: [RegExp, string, NflPlayerMarket['category']][] = [
    [/rush.*receiv.*yard/, 'rushing_receiving_yards', 'rushing'],
    [/longest.*(?:reception|receiving)/, 'longest_reception', 'receiving'],
    [/longest.*rush/, 'longest_rush', 'rushing'],
    [/longest.*(?:pass|completion)/, 'longest_pass', 'passing'],
    [/receiv.*yard/, 'receiving_yards', 'receiving'], [/rush.*yard/, 'rushing_yards', 'rushing'],
    [/pass.*yard/, 'passing_yards', 'passing'], [/pass.*touchdown/, 'passing_tds', 'passing'],
    [/pass.*attempt/, 'passing_attempts', 'passing'], [/completion/, 'passing_completions', 'passing'],
    [/rush.*attempt/, 'rushing_attempts', 'rushing'], [/reception/, 'receptions', 'receiving'],
    [/interception/, 'interceptions', 'passing'], [/field goal/, 'field_goals_made', 'kicking'],
  ]
  const rule = rules.find(([pattern]) => pattern.test(s))
  return rule ? { prop: rule[1], category: rule[2], line: null } : null
}

export function parseNflFanduel(tabs: FdTab[], base: SidelineOddsBoard) {
  const players = new Map<number, NflOddsPlayer>()
  const rejected = new Set<string>()
  for (const tab of tabs) for (const [section, outcomes] of Object.entries(tab.sections ?? {})) for (const outcome of outcomes) {
    const parts = outcome.parts ?? [outcome.selection ?? '']
    const joined = parts.join(' ')
    const matches = base.players.filter(p => parts.some(part => normalize(part) === normalize(p.name)) || normalize(`${section} ${joined}`).includes(normalize(p.name)))
    if (matches.length !== 1) { rejected.add(section); continue }
    const identity = matches[0]
    const spec = nflFdMarket(`${section} ${outcome.market_hint ?? ''}`)
    const odds = /^even$/i.test(outcome.odds) ? 100 : /^[+-]\d+$/.test(outcome.odds) ? Number(outcome.odds) : NaN
    if (!spec || !Number.isFinite(odds) || Math.abs(odds) < 100) { rejected.add(section); continue }
    const side = /\bover\b/i.test(joined) ? 'over' : /\bunder\b/i.test(joined) ? 'under' : 'odds'
    const threshold = joined.match(/(?:over|under)\s+(\d+(?:\.\d+)?)/i) ?? joined.match(/\b(\d+(?:\.\d+)?)\+/)
    const line = spec.line ?? (threshold ? Number(threshold[1]) : null)
    if (line == null) { rejected.add(section); continue }
    const key = `${spec.prop}:${line}`
    const player = players.get(identity.id) ?? { ...identity, markets: [], publicPicks: [] }
    let market = player.markets.find(m => m.key === key)
    if (!market) { market = { key, propType: spec.prop, label: section, category: spec.category, line, offers: [] }; player.markets.push(market) }
    let offer = market.offers[0]
    if (!offer) {
      const old = identity.markets.find(m => m.key === key)?.offers.find(o => o.vendor === 'fanduel')
      offer = { vendor: 'fanduel', type: side === 'odds' ? 'milestone' : 'over_under', line, openingLine: old?.openingLine ?? line, current: {}, opening: old?.opening ?? old?.current ?? null, updatedAt: tab.scraped_at }
      market.offers.push(offer)
    }
    offer.current[side] = odds
    players.set(player.id, player)
  }
  for (const p of players.values()) for (const m of p.markets) for (const o of m.offers) o.opening ??= { ...o.current }
  return { board: { ...base, gameLines: [], players: [...players.values()], capturedAt: tabs.map(t => t.scraped_at).sort().at(-1) ?? null } as SidelineOddsBoard, rejected: [...rejected] }
}
