const normName = (s: string) =>
  (s || '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ').trim()

const POS_ORDER: Record<string, number> = {
  C: 2, '1B': 3, '2B': 4, '3B': 5, SS: 6,
  LF: 7, CF: 8, RF: 9, DH: 1, OF: 7, INF: 4,
}

export interface LineupBatter {
  mlbId: number
  name: string
  nameNorm: string
  position: string
  projected: boolean
}

async function fetchProjectedLineup(teamId: number): Promise<LineupBatter[]> {
  try {
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=Active`,
      { cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' } }
    )
    if (!res.ok) return []
    const data = await res.json()
    const roster: any[] = data.roster ?? []
    return roster
      .filter(p => p.position?.type !== 'Pitcher')
      .sort((a, b) => (POS_ORDER[a.position?.abbreviation] ?? 9) - (POS_ORDER[b.position?.abbreviation] ?? 9))
      .map(p => ({
        mlbId: p.person.id,
        name: p.person.fullName || '',
        nameNorm: normName(p.person.fullName || ''),
        position: p.position?.abbreviation || '?',
        projected: true,
      }))
  } catch { return [] }
}

// Confirmed lineup when the schedule's lineups hydrate has posted it,
// otherwise falls back to the team's active-roster position players
// (same "projected" fallback pattern already used in the Dugout).
export async function fetchGameLineups(gamePk: string | number): Promise<{
  confirmed: boolean
  home: LineupBatter[]
  away: LineupBatter[]
  homeAbbr: string
  awayAbbr: string
  homeTeam: string
  awayTeam: string
  venueId: number | null
}> {
  const res = await fetch(
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePk=${gamePk}&hydrate=lineups,team,venue`,
    { cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' } }
  )
  if (!res.ok) throw new Error('schedule fetch failed')
  const data = await res.json()
  const g = data.dates?.[0]?.games?.[0]
  if (!g) throw new Error('game not found')

  const homeAbbr = g.teams?.home?.team?.abbreviation || ''
  const awayAbbr = g.teams?.away?.team?.abbreviation || ''
  const homeTeam = g.teams?.home?.team?.name || ''
  const awayTeam = g.teams?.away?.team?.name || ''
  const homeTeamId = g.teams?.home?.team?.id
  const awayTeamId = g.teams?.away?.team?.id
  const venueId = g.venue?.id ?? null

  const mkConfirmed = (players: any[]): LineupBatter[] =>
    (players || []).map((p: any) => ({
      mlbId: p.id,
      name: p.fullName || '',
      nameNorm: normName(p.fullName || ''),
      position: p.primaryPosition?.abbreviation || '?',
      projected: false,
    }))

  let home = mkConfirmed(g.lineups?.homePlayers || [])
  let away = mkConfirmed(g.lineups?.awayPlayers || [])
  const confirmed = home.length > 0 && away.length > 0

  if (!home.length && homeTeamId) home = await fetchProjectedLineup(homeTeamId)
  if (!away.length && awayTeamId) away = await fetchProjectedLineup(awayTeamId)

  return { confirmed, home, away, homeAbbr, awayAbbr, homeTeam, awayTeam, venueId }
}

export interface BatterHrCount {
  total: number   // since 2015 (Statcast era) at this park
  season: number  // this season only, at this park
}

// Minimal CSV parser handling quoted fields (Savant quotes every field, and
// `des`/`player_name` can theoretically contain commas) — the file here is
// small (all HR events at one park across ~10 seasons, typically low
// hundreds of rows), so a simple row-by-row parse is fine.
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else { inQuotes = false }
      } else cur += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      out.push(cur); cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

async function fetchHrCsvRows(url: string): Promise<{ batterId: number; year: number }[]> {
  const rows: { batterId: number; year: number }[] = []
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 3600 } })
    if (!res.ok) return rows
    const text = await res.text()
    const lines = text.split('\n')
    if (lines.length < 2) return rows
    const header = parseCsvLine(lines[0])
    const iBatter = header.indexOf('batter')
    const iYear = header.indexOf('game_year')
    if (iBatter === -1 || iYear === -1) return rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      const cols = parseCsvLine(line)
      const batterId = parseInt(cols[iBatter], 10)
      const year = parseInt(cols[iYear], 10)
      if (batterId && year) rows.push({ batterId, year })
    }
  } catch {}
  return rows
}

// Every home run hit AT this specific park since 2015 (Statcast era), by
// ANY batter — home team's own hitters, plus any visiting batter who's
// gone deep here. Savant's `team` filter binds to the BATTER's team, not
// the venue — `team=NYY&home_road=Home` only ever returns Yankees hitters,
// silently excluding every opposing team's HRs at that park (confirmed by
// testing the raw CSV response directly, not assumed). Getting the full
// picture takes two separate queries merged together: the park's own team
// batting at home, and every OTHER team's batters when playing on the road
// against that team specifically (`opponent=`, no `team=`) — which by
// definition means they were visiting this exact park.
export async function fetchParkHrCounts(homeAbbr: string, currentSeason: number): Promise<Map<number, BatterHrCount>> {
  const startSeason = 2015
  const seasons = Array.from({ length: currentSeason - startSeason + 1 }, (_, i) => startSeason + i)
  const seasonParam = seasons.map(s => `${s}%7C`).join('')
  const base = `https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfGT=R%7C&hfSea=${seasonParam}&player_type=batter&hfAB=home_run%7C&type=details`
  const homeUrl = `${base}&home_road=Home&team=${homeAbbr}`
  const roadUrl = `${base}&home_road=Road&opponent=${homeAbbr}`

  const [homeRows, roadRows] = await Promise.all([fetchHrCsvRows(homeUrl), fetchHrCsvRows(roadUrl)])
  const map = new Map<number, BatterHrCount>()
  for (const { batterId, year } of [...homeRows, ...roadRows]) {
    const entry = map.get(batterId) ?? { total: 0, season: 0 }
    entry.total++
    if (year === currentSeason) entry.season++
    map.set(batterId, entry)
  }
  return map
}
