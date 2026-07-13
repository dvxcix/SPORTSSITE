// FanDuel odds as posted for tonight's 2026 HR Derby — transcribed directly,
// not fetched (no live odds API wired to this one-night page). American odds
// -> implied probability via the standard formula, then devigged (normalized
// to sum 100% within each market) so "most likely to cash" reflects the
// book's own true lean with the vig stripped out, not the raw juiced number.

export type OddsOption = { player: string; odds: number }
export type Market = {
  title: string
  time?: string
  options: OddsOption[]
  statKey?: 'exitVelo' | 'longestHr' | 'mostHr' | 'recentHr'
}
export type PairMarket = { title: string; time?: string; pairs: { a: string; b?: string; odds: number }[] }
export type PropLine = { player: string; label: string; line: number; overOdds: number; underOdds: number }
export type TwoWayMarket = { title: string; options: OddsOption[] }

export function impliedProb(odds: number): number {
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100)
}

export function devig(options: OddsOption[]): (OddsOption & { prob: number })[] {
  const raw = options.map(o => ({ ...o, prob: impliedProb(o.odds) }))
  const total = raw.reduce((s, o) => s + o.prob, 0)
  return raw.map(o => ({ ...o, prob: o.prob / total })).sort((a, b) => b.prob - a.prob)
}

export const PLAYER_MARKETS: Market[] = [
  { title: 'HR Derby Champion', time: '8:00pm ET', statKey: 'mostHr', options: [
    { player: 'Kyle Schwarber', odds: 300 }, { player: 'Junior Caminero', odds: 350 },
    { player: 'Munetaka Murakami', odds: 550 }, { player: 'Jordan Walker', odds: 650 },
    { player: 'Jac Caglianone', odds: 700 }, { player: 'Bryce Harper', odds: 1000 },
    { player: 'Ben Rice', odds: 1100 }, { player: 'Willson Contreras', odds: 1300 },
  ]},
  { title: 'Player to Hit the Longest Home Run', time: '8:00pm ET', statKey: 'longestHr', options: [
    { player: 'Junior Caminero', odds: 300 }, { player: 'Kyle Schwarber', odds: 340 },
    { player: 'Jordan Walker', odds: 360 }, { player: 'Jac Caglianone', odds: 500 },
    { player: 'Munetaka Murakami', odds: 500 }, { player: 'Bryce Harper', odds: 1400 },
    { player: 'Willson Contreras', odds: 1400 }, { player: 'Ben Rice', odds: 3500 },
  ]},
  { title: 'Player to Hit the Home Run with the Highest Exit Velocity', time: '8:00pm ET', statKey: 'exitVelo', options: [
    { player: 'Junior Caminero', odds: 150 }, { player: 'Jordan Walker', odds: 250 },
    { player: 'Jac Caglianone', odds: 440 }, { player: 'Kyle Schwarber', odds: 700 },
    { player: 'Munetaka Murakami', odds: 1600 }, { player: 'Willson Contreras', odds: 1600 },
    { player: 'Bryce Harper', odds: 2500 }, { player: 'Ben Rice', odds: 6000 },
  ]},
  { title: 'Player to Hit the Most Home Runs in the First Round', time: '8:00pm ET', statKey: 'recentHr', options: [
    { player: 'Kyle Schwarber', odds: 270 }, { player: 'Junior Caminero', odds: 300 },
    { player: 'Munetaka Murakami', odds: 470 }, { player: 'Jac Caglianone', odds: 500 },
    { player: 'Jordan Walker', odds: 500 }, { player: 'Bryce Harper', odds: 700 },
    { player: 'Ben Rice', odds: 700 }, { player: 'Willson Contreras', odds: 800 },
  ]},
  { title: 'Player to Hit 10+ Home Runs in the First Round', time: '8:00pm ET', options: [
    { player: 'Kyle Schwarber', odds: -180 }, { player: 'Junior Caminero', odds: -162 },
    { player: 'Munetaka Murakami', odds: -106 }, { player: 'Jac Caglianone', odds: 106 },
    { player: 'Jordan Walker', odds: 104 }, { player: 'Ben Rice', odds: 148 },
    { player: 'Bryce Harper', odds: 140 }, { player: 'Willson Contreras', odds: 162 },
  ]},
  { title: 'Player to Hit 12+ Home Runs in the First Round', time: '8:00pm ET', options: [
    { player: 'Junior Caminero', odds: 194 }, { player: 'Jordan Walker', odds: 300 },
    { player: 'Bryce Harper', odds: 390 }, { player: 'Ben Rice', odds: 410 },
    { player: 'Willson Contreras', odds: 450 }, { player: 'Munetaka Murakami', odds: 280 },
    { player: 'Kyle Schwarber', odds: 174 }, { player: 'Jac Caglianone', odds: 300 },
  ]},
  { title: 'Player to Hit 15+ Home Runs in the First Round', time: '8:00pm ET', options: [
    { player: 'Kyle Schwarber', odds: 750 }, { player: 'Junior Caminero', odds: 800 },
    { player: 'Munetaka Murakami', odds: 1100 }, { player: 'Jac Caglianone', odds: 1200 },
    { player: 'Jordan Walker', odds: 1200 }, { player: 'Bryce Harper', odds: 1400 },
    { player: 'Ben Rice', odds: 1500 }, { player: 'Willson Contreras', odds: 1700 },
  ]},
  { title: 'Player to Hit 3+ Lasers (110+ MPH) in the First Round', time: '8:00pm ET', options: [
    { player: 'Junior Caminero', odds: -132 }, { player: 'Kyle Schwarber', odds: -108 },
    { player: 'Munetaka Murakami', odds: 110 }, { player: 'Jac Caglianone', odds: 134 },
    { player: 'Jordan Walker', odds: 144 }, { player: 'Willson Contreras', odds: 230 },
    { player: 'Bryce Harper', odds: 270 }, { player: 'Ben Rice', odds: 280 },
  ]},
  { title: 'Player to Hit 5+ Lasers (110+ MPH) in the First Round', time: '8:00pm ET', options: [
    { player: 'Junior Caminero', odds: 400 }, { player: 'Kyle Schwarber', odds: 490 },
    { player: 'Munetaka Murakami', odds: 580 }, { player: 'Jac Caglianone', odds: 680 },
    { player: 'Jordan Walker', odds: 750 }, { player: 'Willson Contreras', odds: 1200 },
    { player: 'Bryce Harper', odds: 1400 }, { player: 'Ben Rice', odds: 1400 },
  ]},
  { title: 'Round 1 First Swing to be a Home Run', time: '8:00pm ET', options: [
    { player: 'Junior Caminero', odds: 182 }, { player: 'Jordan Walker', odds: 220 },
    { player: 'Kyle Schwarber', odds: 162 }, { player: 'Jac Caglianone', odds: 198 },
    { player: 'Bryce Harper', odds: 220 }, { player: 'Willson Contreras', odds: 205 },
    { player: 'Ben Rice', odds: 220 }, { player: 'Munetaka Murakami', odds: 182 },
  ]},
  { title: 'Round 1 First Swing to be a Laser (110MPH+)', time: '8:00pm ET', options: [
    { player: 'Junior Caminero', odds: 500 }, { player: 'Munetaka Murakami', odds: 600 },
    { player: 'Kyle Schwarber', odds: 700 }, { player: 'Jac Caglianone', odds: 900 },
    { player: 'Jordan Walker', odds: 900 }, { player: 'Willson Contreras', odds: 1100 },
  ]},
  { title: 'To Make Semifinal', time: '8:00pm ET', options: [
    { player: 'Kyle Schwarber', odds: -210 }, { player: 'Junior Caminero', odds: -186 },
    { player: 'Munetaka Murakami', odds: -125 }, { player: 'Jordan Walker', odds: -113 },
    { player: 'Jac Caglianone', odds: -108 }, { player: 'Ben Rice', odds: 128 },
    { player: 'Bryce Harper', odds: 120 }, { player: 'Willson Contreras', odds: 140 },
  ]},
  { title: 'To Make the Finals', time: '8:00pm ET', options: [
    { player: 'Kyle Schwarber', odds: 150 }, { player: 'Junior Caminero', odds: 168 },
    { player: 'Munetaka Murakami', odds: 250 }, { player: 'Jordan Walker', odds: 285 },
    { player: 'Jac Caglianone', odds: 285 }, { player: 'Bryce Harper', odds: 390 },
    { player: 'Ben Rice', odds: 400 }, { player: 'Willson Contreras', odds: 450 },
  ]},
  { title: 'Player to Win the HR Derby and All-Star Game MVP', time: '8:00pm ET', options: [
    { player: 'Kyle Schwarber', odds: 4500 }, { player: 'Junior Caminero', odds: 8000 },
    { player: 'Bryce Harper', odds: 12500 }, { player: 'Munetaka Murakami', odds: 12500 },
    { player: 'Jordan Walker', odds: 15000 }, { player: 'Ben Rice', odds: 20000 },
    { player: 'Willson Contreras', odds: 25000 },
  ]},
]

export const LEAGUE_MARKET: Market = { title: 'League of Winner', time: '8:00pm ET', options: [
  { player: 'American League', odds: -158 }, { player: 'National League', odds: 128 },
]}

export const TOTAL_MARKETS: { title: string; time?: string; note?: string; options: OddsOption[] }[] = [
  { title: 'Total Home Runs Hit By All Players — 117.5', time: '8:00pm ET', options: [
    { player: 'Under 117.5', odds: -113 }, { player: 'Over 117.5', odds: -113 },
  ]},
  { title: 'Will There Be a Swing-Off Tiebreaker in Any Round?', time: '8:00pm ET', note: 'Market is settled off data from MLB Statcast.', options: [
    { player: 'Yes', odds: 175 }, { player: 'No', odds: -270 },
  ]},
  { title: 'Round 1 Total Home Runs — 74.5', time: '8:00pm ET', options: [
    { player: 'Under 74.5', odds: -114 }, { player: 'Over 74.5', odds: -114 },
  ]},
  { title: 'Highest Exit Velocity (Any Player) — 116.5', time: '8:00pm ET', options: [
    { player: 'Under 116.5', odds: -110 }, { player: 'Over 116.5', odds: -114 },
  ]},
]

export const FT500_MARKET = { title: 'Total Number of 500+ Foot Home Runs', time: '8:00pm ET', options: [
  { player: '1+', odds: 200 }, { player: '2+', odds: 440 }, { player: '3+', odds: 700 },
  { player: '4+', odds: 1400 }, { player: '5+', odds: 2200 }, { player: '6+', odds: 4000 },
]}

export const H2H_MARKETS: { title: string; a: string; b: string; oddsA: number; oddsB: number; time?: string }[] = [
  { title: 'First Round More HRs', a: 'Bryce Harper', b: 'Kyle Schwarber', oddsA: 172, oddsB: -215, time: '8:00pm ET' },
  { title: 'First Round More HRs', a: 'Kyle Schwarber', b: 'Junior Caminero', oddsA: -118, oddsB: -104, time: '8:00pm ET' },
  { title: 'First Round More HRs', a: 'Jordan Walker', b: 'Jac Caglianone', oddsA: -105, oddsB: -115, time: '8:00pm ET' },
  { title: 'First Round More HRs', a: 'Munetaka Murakami', b: 'Jac Caglianone', oddsA: -120, oddsB: -102, time: '8:00pm ET' },
  { title: 'First Round More HRs', a: 'Bryce Harper', b: 'Ben Rice', oddsA: -120, oddsB: -102, time: '8:00pm ET' },
  { title: 'First Round More HRs', a: 'Ben Rice', b: 'Willson Contreras', oddsA: -120, oddsB: -102, time: '8:00pm ET' },
]

export const PROP_LINES: PropLine[] = [
  { player: 'Junior Caminero', label: 'First Round Total Home Runs', line: 10.5, overOdds: 114, underOdds: -146 },
  { player: 'Junior Caminero', label: 'Longest HR Distance', line: 479.5, overOdds: -112, underOdds: -112 },
  { player: 'Junior Caminero', label: 'Highest HR Exit Velocity (MPH)', line: 115.5, overOdds: -110, underOdds: -114 },
  { player: 'Willson Contreras', label: 'First Round Total Home Runs', line: 8.5, overOdds: 106, underOdds: -136 },
  { player: 'Willson Contreras', label: 'Longest HR Distance', line: 459.5, overOdds: -112, underOdds: -112 },
  { player: 'Willson Contreras', label: 'Highest HR Exit Velocity (MPH)', line: 110.5, overOdds: -122, underOdds: -102 },
  { player: 'Bryce Harper', label: 'Longest HR Distance', line: 461.5, overOdds: -112, underOdds: -112 },
  { player: 'Bryce Harper', label: 'First Round Total Home Runs', line: 8.5, overOdds: -146, underOdds: 114 },
  { player: 'Bryce Harper', label: 'Highest HR Exit Velocity (MPH)', line: 108.5, overOdds: -104, underOdds: -120 },
  { player: 'Munetaka Murakami', label: 'First Round Total Home Runs', line: 9.5, overOdds: 106, underOdds: -136 },
  { player: 'Munetaka Murakami', label: 'Longest HR Distance', line: 470.5, overOdds: -112, underOdds: -112 },
  { player: 'Munetaka Murakami', label: 'Highest HR Exit Velocity (MPH)', line: 112.5, overOdds: -112, underOdds: -112 },
  { player: 'Jordan Walker', label: 'First Round Total Home Runs', line: 8.5, overOdds: -146, underOdds: 114 },
  { player: 'Jordan Walker', label: 'Longest HR Distance', line: 475.5, overOdds: -112, underOdds: -112 },
  { player: 'Jordan Walker', label: 'Highest HR Exit Velocity (MPH)', line: 114.5, overOdds: -108, underOdds: -116 },
  { player: 'Jac Caglianone', label: 'First Round Total Home Runs', line: 8.5, overOdds: -166, underOdds: 130 },
  { player: 'Jac Caglianone', label: 'Longest HR Distance', line: 467.5, overOdds: -112, underOdds: -112 },
  { player: 'Jac Caglianone', label: 'Highest HR Exit Velocity (MPH)', line: 112.5, overOdds: -124, underOdds: 100 },
  { player: 'Kyle Schwarber', label: 'Highest HR Exit Velocity (MPH)', line: 112.5, overOdds: -112, underOdds: -112 },
  { player: 'Kyle Schwarber', label: 'First Round Total Home Runs', line: 10.5, overOdds: 102, underOdds: -130 },
  { player: 'Kyle Schwarber', label: 'Longest HR Distance', line: 473.5, overOdds: -112, underOdds: -112 },
  { player: 'Ben Rice', label: 'First Round Total Home Runs', line: 8.5, overOdds: -115, underOdds: -111 },
  { player: 'Ben Rice', label: 'Longest HR Distance', line: 439.5, overOdds: -112, underOdds: -112 },
  { player: 'Ben Rice', label: 'Highest HR Exit Velocity (MPH)', line: 106.5, overOdds: -118, underOdds: -106 },
]

export const EXACT_RESULT: { a: string; b: string; odds: number }[] = [
  { a: 'Ben Rice', b: 'Bryce Harper', odds: 7500 }, { a: 'Ben Rice', b: 'Jac Caglianone', odds: 6500 },
  { a: 'Ben Rice', b: 'Jordan Walker', odds: 6500 }, { a: 'Ben Rice', b: 'Junior Caminero', odds: 4500 },
  { a: 'Ben Rice', b: 'Kyle Schwarber', odds: 4500 }, { a: 'Ben Rice', b: 'Munetaka Murakami', odds: 6000 },
  { a: 'Ben Rice', b: 'Willson Contreras', odds: 7500 },
  { a: 'Bryce Harper', b: 'Ben Rice', odds: 7500 }, { a: 'Bryce Harper', b: 'Jac Caglianone', odds: 5500 },
  { a: 'Bryce Harper', b: 'Jordan Walker', odds: 6000 }, { a: 'Bryce Harper', b: 'Junior Caminero', odds: 4000 },
  { a: 'Bryce Harper', b: 'Kyle Schwarber', odds: 4000 }, { a: 'Bryce Harper', b: 'Munetaka Murakami', odds: 5000 },
  { a: 'Bryce Harper', b: 'Willson Contreras', odds: 8000 },
  { a: 'Jac Caglianone', b: 'Ben Rice', odds: 5000 }, { a: 'Jac Caglianone', b: 'Bryce Harper', odds: 4500 },
  { a: 'Jac Caglianone', b: 'Jordan Walker', odds: 4000 }, { a: 'Jac Caglianone', b: 'Junior Caminero', odds: 3000 },
  { a: 'Jac Caglianone', b: 'Kyle Schwarber', odds: 3000 }, { a: 'Jac Caglianone', b: 'Munetaka Murakami', odds: 4000 },
  { a: 'Jac Caglianone', b: 'Willson Contreras', odds: 5500 },
  { a: 'Jordan Walker', b: 'Ben Rice', odds: 4500 }, { a: 'Jordan Walker', b: 'Bryce Harper', odds: 4500 },
  { a: 'Jordan Walker', b: 'Jac Caglianone', odds: 4000 }, { a: 'Jordan Walker', b: 'Junior Caminero', odds: 3000 },
  { a: 'Jordan Walker', b: 'Kyle Schwarber', odds: 3000 }, { a: 'Jordan Walker', b: 'Munetaka Murakami', odds: 3500 },
  { a: 'Jordan Walker', b: 'Willson Contreras', odds: 5000 },
  { a: 'Junior Caminero', b: 'Ben Rice', odds: 3000 }, { a: 'Junior Caminero', b: 'Bryce Harper', odds: 3000 },
  { a: 'Junior Caminero', b: 'Jac Caglianone', odds: 2500 }, { a: 'Junior Caminero', b: 'Jordan Walker', odds: 2200 },
  { a: 'Junior Caminero', b: 'Kyle Schwarber', odds: 1300 }, { a: 'Junior Caminero', b: 'Munetaka Murakami', odds: 2200 },
  { a: 'Junior Caminero', b: 'Willson Contreras', odds: 3300 },
  { a: 'Kyle Schwarber', b: 'Ben Rice', odds: 2700 }, { a: 'Kyle Schwarber', b: 'Bryce Harper', odds: 2700 },
  { a: 'Kyle Schwarber', b: 'Jac Caglianone', odds: 2200 }, { a: 'Kyle Schwarber', b: 'Jordan Walker', odds: 2200 },
  { a: 'Kyle Schwarber', b: 'Junior Caminero', odds: 1300 }, { a: 'Kyle Schwarber', b: 'Munetaka Murakami', odds: 2000 },
  { a: 'Kyle Schwarber', b: 'Willson Contreras', odds: 2700 },
  { a: 'Munetaka Murakami', b: 'Ben Rice', odds: 4000 }, { a: 'Munetaka Murakami', b: 'Bryce Harper', odds: 4000 },
  { a: 'Munetaka Murakami', b: 'Jac Caglianone', odds: 3500 }, { a: 'Munetaka Murakami', b: 'Jordan Walker', odds: 3500 },
  { a: 'Munetaka Murakami', b: 'Junior Caminero', odds: 2700 }, { a: 'Munetaka Murakami', b: 'Kyle Schwarber', odds: 2700 },
  { a: 'Munetaka Murakami', b: 'Willson Contreras', odds: 5000 },
  { a: 'Willson Contreras', b: 'Ben Rice', odds: 7500 }, { a: 'Willson Contreras', b: 'Bryce Harper', odds: 8000 },
  { a: 'Willson Contreras', b: 'Jac Caglianone', odds: 7500 }, { a: 'Willson Contreras', b: 'Jordan Walker', odds: 7000 },
  { a: 'Willson Contreras', b: 'Junior Caminero', odds: 5500 }, { a: 'Willson Contreras', b: 'Kyle Schwarber', odds: 5000 },
  { a: 'Willson Contreras', b: 'Munetaka Murakami', odds: 7000 },
]

export const FINALISTS: { a: string; b: string; odds: number }[] = [
  { a: 'Junior Caminero', b: 'Kyle Schwarber', odds: 700 }, { a: 'Kyle Schwarber', b: 'Munetaka Murakami', odds: 1200 },
  { a: 'Junior Caminero', b: 'Munetaka Murakami', odds: 1300 }, { a: 'Jac Caglianone', b: 'Kyle Schwarber', odds: 1300 },
  { a: 'Jordan Walker', b: 'Junior Caminero', odds: 1400 }, { a: 'Jordan Walker', b: 'Kyle Schwarber', odds: 1400 },
  { a: 'Jac Caglianone', b: 'Junior Caminero', odds: 1500 }, { a: 'Bryce Harper', b: 'Kyle Schwarber', odds: 1800 },
  { a: 'Bryce Harper', b: 'Junior Caminero', odds: 1900 }, { a: 'Ben Rice', b: 'Kyle Schwarber', odds: 2000 },
  { a: 'Ben Rice', b: 'Junior Caminero', odds: 2000 }, { a: 'Kyle Schwarber', b: 'Willson Contreras', odds: 2000 },
  { a: 'Jordan Walker', b: 'Munetaka Murakami', odds: 2000 }, { a: 'Jac Caglianone', b: 'Jordan Walker', odds: 2200 },
  { a: 'Jac Caglianone', b: 'Munetaka Murakami', odds: 2200 }, { a: 'Junior Caminero', b: 'Willson Contreras', odds: 2200 },
  { a: 'Bryce Harper', b: 'Munetaka Murakami', odds: 2500 }, { a: 'Ben Rice', b: 'Munetaka Murakami', odds: 2700 },
  { a: 'Bryce Harper', b: 'Jordan Walker', odds: 3000 }, { a: 'Munetaka Murakami', b: 'Willson Contreras', odds: 3000 },
  { a: 'Ben Rice', b: 'Jordan Walker', odds: 3000 }, { a: 'Jordan Walker', b: 'Willson Contreras', odds: 3000 },
  { a: 'Ben Rice', b: 'Jac Caglianone', odds: 3000 }, { a: 'Bryce Harper', b: 'Jac Caglianone', odds: 3000 },
  { a: 'Jac Caglianone', b: 'Willson Contreras', odds: 3300 }, { a: 'Ben Rice', b: 'Willson Contreras', odds: 4000 },
  { a: 'Bryce Harper', b: 'Willson Contreras', odds: 4000 }, { a: 'Ben Rice', b: 'Bryce Harper', odds: 4000 },
]

export const DOUBLE_CHANCE: { a: string; b: string; odds: number }[] = [
  { a: 'Junior Caminero', b: 'Kyle Schwarber', odds: 115 }, { a: 'Kyle Schwarber', b: 'Munetaka Murakami', odds: 155 },
  { a: 'Jordan Walker', b: 'Kyle Schwarber', odds: 165 }, { a: 'Junior Caminero', b: 'Munetaka Murakami', odds: 175 },
  { a: 'Jac Caglianone', b: 'Kyle Schwarber', odds: 170 }, { a: 'Jordan Walker', b: 'Junior Caminero', odds: 185 },
  { a: 'Jac Caglianone', b: 'Junior Caminero', odds: 190 }, { a: 'Bryce Harper', b: 'Kyle Schwarber', odds: 200 },
  { a: 'Ben Rice', b: 'Kyle Schwarber', odds: 200 }, { a: 'Kyle Schwarber', b: 'Willson Contreras', odds: 210 },
  { a: 'Bryce Harper', b: 'Junior Caminero', odds: 220 }, { a: 'Ben Rice', b: 'Junior Caminero', odds: 230 },
  { a: 'Junior Caminero', b: 'Willson Contreras', odds: 240 }, { a: 'Jordan Walker', b: 'Munetaka Murakami', odds: 260 },
  { a: 'Jac Caglianone', b: 'Munetaka Murakami', odds: 270 }, { a: 'Jac Caglianone', b: 'Jordan Walker', odds: 290 },
  { a: 'Bryce Harper', b: 'Munetaka Murakami', odds: 330 }, { a: 'Ben Rice', b: 'Munetaka Murakami', odds: 340 },
  { a: 'Bryce Harper', b: 'Jordan Walker', odds: 350 }, { a: 'Munetaka Murakami', b: 'Willson Contreras', odds: 360 },
  { a: 'Ben Rice', b: 'Jordan Walker', odds: 370 }, { a: 'Bryce Harper', b: 'Jac Caglianone', odds: 370 },
  { a: 'Ben Rice', b: 'Jac Caglianone', odds: 380 }, { a: 'Jordan Walker', b: 'Willson Contreras', odds: 390 },
  { a: 'Jac Caglianone', b: 'Willson Contreras', odds: 410 }, { a: 'Ben Rice', b: 'Bryce Harper', odds: 490 },
  { a: 'Bryce Harper', b: 'Willson Contreras', odds: 500 }, { a: 'Ben Rice', b: 'Willson Contreras', odds: 550 },
]

export const COMBINE_MARKETS: { threshold: string; pairs: { a: string; b: string; odds: number }[] }[] = [
  { threshold: '20+', pairs: [
    { a: 'Kyle Schwarber', b: 'Munetaka Murakami', odds: -128 }, { a: 'Jac Caglianone', b: 'Kyle Schwarber', odds: -118 },
    { a: 'Jac Caglianone', b: 'Junior Caminero', odds: -108 }, { a: 'Bryce Harper', b: 'Kyle Schwarber', odds: 102 },
    { a: 'Bryce Harper', b: 'Junior Caminero', odds: 114 }, { a: 'Junior Caminero', b: 'Ben Rice', odds: 116 },
    { a: 'Jordan Walker', b: 'Jac Caglianone', odds: 130 }, { a: 'Ben Rice', b: 'Jordan Walker', odds: 164 },
    { a: 'Munetaka Murakami', b: 'Willson Contreras', odds: 164 }, { a: 'Willson Contreras', b: 'Bryce Harper', odds: 205 },
  ]},
  { threshold: '25+', pairs: [
    { a: 'Kyle Schwarber', b: 'Munetaka Murakami', odds: 490 }, { a: 'Jac Caglianone', b: 'Junior Caminero', odds: 550 },
    { a: 'Jac Caglianone', b: 'Kyle Schwarber', odds: 550 }, { a: 'Bryce Harper', b: 'Junior Caminero', odds: 640 },
    { a: 'Bryce Harper', b: 'Kyle Schwarber', odds: 640 }, { a: 'Junior Caminero', b: 'Ben Rice', odds: 700 },
    { a: 'Jordan Walker', b: 'Jac Caglianone', odds: 750 }, { a: 'Ben Rice', b: 'Jordan Walker', odds: 920 },
    { a: 'Munetaka Murakami', b: 'Willson Contreras', odds: 920 }, { a: 'Willson Contreras', b: 'Bryce Harper', odds: 1200 },
  ]},
  { threshold: '30+', pairs: [
    { a: 'Kyle Schwarber', b: 'Munetaka Murakami', odds: 2200 }, { a: 'Jac Caglianone', b: 'Junior Caminero', odds: 2500 },
    { a: 'Jac Caglianone', b: 'Kyle Schwarber', odds: 2500 }, { a: 'Bryce Harper', b: 'Junior Caminero', odds: 3000 },
    { a: 'Bryce Harper', b: 'Kyle Schwarber', odds: 3000 }, { a: 'Junior Caminero', b: 'Ben Rice', odds: 4000 },
    { a: 'Munetaka Murakami', b: 'Willson Contreras', odds: 5000 }, { a: 'Willson Contreras', b: 'Bryce Harper', odds: 5000 },
    { a: 'Ben Rice', b: 'Jordan Walker', odds: 5000 }, { a: 'Jordan Walker', b: 'Jac Caglianone', odds: 5000 },
  ]},
]
