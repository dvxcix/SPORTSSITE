import type { NflGameLineBook, NflMarketOffer, NflPlayerMarket, NflTdBaseline, SidelineOddsBoard } from './nflOddsTypes'

// Stored alongside the complete original board at capture time. No price in
// the original observation is deleted or restamped. A replacement is null
// when the current feed had no corresponding contract.
export type NflPausedProjection = {
  gameId: string
  bdlGameId: number | null
  capturedAt: string | null
  status: SidelineOddsBoard['status']
  source: SidelineOddsBoard['source']
  openingOnly?: SidelineOddsBoard['openingOnly']
  offers: { playerId: number; marketKey: string; vendor: string; type: NflMarketOffer['type']; line: number | null; current: NflMarketOffer['current']; updatedAt: string | null; replacement: NflMarketOffer | null; market: Omit<NflPlayerMarket, 'offers'> | null }[]
  lines: { vendor: string; original: NflGameLineBook; replacement: NflGameLineBook | null }[]
  baselines: { playerId: number; value: NflTdBaseline[] | null }[]
}
type OfferRef = [number, number, number, 0 | 1, number | null, NflMarketOffer['current'], number, NflMarketOffer | null, Omit<NflPlayerMarket, 'offers'> | null]
export type NflPackedProjection = {
  v: 1; g: string; b: number | null; at: string | null; status: SidelineOddsBoard['status']; source: SidelineOddsBoard['source']
  openingOnly?: SidelineOddsBoard['openingOnly']; markets: string[]; vendors: string[]; times: (string | null)[]
  offers: OfferRef[]; lines: NflPausedProjection['lines']; baselines: NflPausedProjection['baselines']
}
export type NflObservedOdds = SidelineOddsBoard & { pausedProjection?: NflPackedProjection }

/** Repeated market/vendor/timestamp strings are interned, with no loss of an
 * individual contract or source time. This is a snapshot field, not a cache. */
export function packNflPausedProjection(marker: NflPausedProjection): NflPackedProjection {
  const markets = new Map<string,number>(), vendors = new Map<string,number>(), times = new Map<string | null,number>()
  const intern = <T,>(dict: Map<T,number>, value:T) => { const existing=dict.get(value);if(existing!=null)return existing;const index=dict.size;dict.set(value,index);return index }
  const offers:OfferRef[] = marker.offers.map(row => [row.playerId,intern(markets,row.marketKey),intern(vendors,row.vendor),row.type === 'milestone' ? 0 : 1,row.line,row.current,intern(times,row.updatedAt),row.replacement,row.market])
  return { v:1,g:marker.gameId,b:marker.bdlGameId,at:marker.capturedAt,status:marker.status,source:marker.source,
    ...(marker.openingOnly ? {openingOnly:marker.openingOnly}:{}),markets:[...markets.keys()],vendors:[...vendors.keys()],times:[...times.keys()],offers,lines:marker.lines,baselines:marker.baselines }
}

export function unpackNflPausedProjection(packed:NflPackedProjection):NflPausedProjection {
  if (!packed || packed.v !== 1 || typeof packed.g !== 'string' || !packed.g || packed.g.length > 64
    || !(packed.b === null || Number.isSafeInteger(packed.b) && packed.b > 0)
    || !(packed.at === null || typeof packed.at === 'string' && Number.isFinite(Date.parse(packed.at)))
    || !['ready','not-posted','unavailable'].includes(packed.status) || !['live','opening','snapshot','none'].includes(packed.source)
    || !Array.isArray(packed.markets) || !Array.isArray(packed.vendors) || !Array.isArray(packed.times)
    || !Array.isArray(packed.offers) || !Array.isArray(packed.lines) || !Array.isArray(packed.baselines)
    || packed.markets.length > 50000 || packed.vendors.length > 128 || packed.times.length > 50000 || packed.offers.length > 50000
    || packed.lines.length > 128 || packed.baselines.length > 5000
    || !packed.markets.every(value => typeof value === 'string' && value.length <= 256)
    || !packed.vendors.every(value => typeof value === 'string' && value.length <= 128)
    || !packed.times.every(value => value === null || typeof value === 'string' && Number.isFinite(Date.parse(value)))
    || packed.openingOnly && (!Array.isArray(packed.openingOnly.offers) || !Array.isArray(packed.openingOnly.lines)
      || packed.openingOnly.offers.length > 50000 || packed.openingOnly.lines.length > 128
      || !packed.openingOnly.offers.every(row => row && Number.isSafeInteger(row.playerId) && row.playerId > 0
        && typeof row.name === 'string' && typeof row.team === 'string' && typeof row.label === 'string' && typeof row.propType === 'string'
        && row.offer?.isOpeningOnly === true && typeof row.offer.vendor === 'string' && validReplacement(row.offer,row.offer.vendor))
      || !packed.openingOnly.lines.every(line => line && line.isOpeningOnly === true && typeof line.vendor === 'string'
        && (line.updatedAt === null || typeof line.updatedAt === 'string' && Number.isFinite(Date.parse(line.updatedAt)))))
    || !packed.baselines.every(row => row && Number.isSafeInteger(row.playerId) && row.playerId > 0 && (row.value === null || Array.isArray(row.value) && row.value.every(validBaseline)))
    || !packed.lines.every(row => row && typeof row.vendor === 'string' && row.original && typeof row.original === 'object' && (row.replacement === null || row.replacement && typeof row.replacement === 'object'))) throw new Error('Invalid NFL projection envelope')
  const pick = <T,>(values:T[],index:number):T => {
    if (!Number.isSafeInteger(index) || index < 0 || index >= values.length) throw new Error('Invalid NFL projection dictionary')
    return values[index]
  }
  return { gameId:packed.g,bdlGameId:packed.b,capturedAt:packed.at,status:packed.status,source:packed.source,openingOnly:packed.openingOnly,
    offers:packed.offers.map(row=>{
      if (!Array.isArray(row) || row.length !== 9 || !Number.isSafeInteger(row[0]) || row[0] <= 0 || (row[3] !== 0 && row[3] !== 1)
        || !(row[4] === null || typeof row[4] === 'number' && Number.isFinite(row[4]))
        || !row[5] || typeof row[5] !== 'object' || Array.isArray(row[5])
        || !(row[7] === null || row[7] && typeof row[7] === 'object') || !(row[8] === null || row[8] && typeof row[8] === 'object')) throw new Error('Invalid NFL projection reference')
      const marketKey=pick(packed.markets,row[1]),vendor=pick(packed.vendors,row[2]),updatedAt=pick(packed.times,row[6])
      if (typeof marketKey !== 'string' || typeof vendor !== 'string' || !(updatedAt === null || typeof updatedAt === 'string')) throw new Error('Invalid NFL projection dictionary')
      return {playerId:row[0],marketKey,vendor,type:row[3] === 0 ? 'milestone' : 'over_under',line:row[4],current:row[5],updatedAt,replacement:row[7],market:row[8]}
    }),lines:packed.lines,baselines:packed.baselines }
}

/** Move opening-only observations out of current calculations and pick paths. */
export function separateNflOpenings(input: SidelineOddsBoard): SidelineOddsBoard {
  const openingOffers = [...(input.openingOnly?.offers ?? [])], openingLines = [...(input.openingOnly?.lines ?? [])]
  const lastSeenOffers = (input.lastSeen?.offers ?? []).filter(row => {
    if (!row.offer.isOpeningOnly) return true
    openingOffers.push(row); return false
  })
  const lastSeenLines = (input.lastSeen?.lines ?? []).filter(line => {
    if (!line.isOpeningOnly) return true
    openingLines.push(line); return false
  })
  const players = input.players.map(player => {
    const markets = player.markets.map(market => ({ ...market, offers: market.offers.filter(offer => {
      if (!offer.isOpeningOnly) return true
      openingOffers.push({ playerId: player.id, name: player.name, team: player.team, label: market.label, propType: market.propType, offer }); return false
    }) })).filter(market => market.offers.length)
    const tdBaselines = player.tdBaselines?.map(baseline => {
      const removed = player.markets.some(market => market.propType === baseline.propType && market.offers.some(offer => offer.vendor === baseline.vendor && offer.isOpeningOnly))
      const retained = markets.some(market => market.propType === baseline.propType && market.offers.some(offer => offer.vendor === baseline.vendor))
      return removed && !retained ? { ...baseline, currentProbability: null, deltaProbabilityPoints: null, deltaPct: null, deltaOdds: null } : baseline
    })
    return { ...player, markets, ...(tdBaselines ? { tdBaselines } : {}) }
  })
  const gameLines = input.gameLines.filter(line => {
    if (!line.isOpeningOnly) return true
    openingLines.push(line); return false
  })
  const uniqueOffers = [...new Map(openingOffers.map(row => [JSON.stringify([row.playerId,row.propType,row.offer.vendor,row.offer.type,row.offer.line,row.offer.updatedAt,row.offer.current,row.offer.opening]),row])).values()]
  const uniqueLines = [...new Map(openingLines.map(line => [JSON.stringify([line.vendor,line.updatedAt,line.spreadHome,line.spreadAway,line.moneylineHome,line.moneylineAway,line.total,line.totalOverOdds,line.totalUnderOdds,line.spreadHomeOdds,line.spreadAwayOdds,line.opening]),line])).values()]
  return { ...input, players, gameLines,
    ...(input.lastSeen ? { lastSeen: { offers: lastSeenOffers, lines: lastSeenLines } } : {}),
    ...(uniqueOffers.length || uniqueLines.length ? { openingOnly: { offers: uniqueOffers, lines: uniqueLines } } : {}) }
}

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
function validReplacement(offer: NflMarketOffer, vendor: string) {
  if (!offer || offer.vendor !== vendor || !['milestone', 'over_under'].includes(offer.type)
    || !(offer.line === null || typeof offer.line === 'number' && Number.isFinite(offer.line))
    || !(offer.updatedAt === null || typeof offer.updatedAt === 'string' && Number.isFinite(Date.parse(offer.updatedAt)))
    || !offer.current || typeof offer.current !== 'object' || Array.isArray(offer.current)) return false
  const allowed = offer.type === 'milestone' ? ['odds'] : ['over', 'under']
  return Object.entries(offer.current).every(([side, value]) => allowed.includes(side)
    && (value == null || typeof value === 'number' && Number.isFinite(value)))
}
function validBaseline(value: NflTdBaseline) {
  return !!value && typeof value === 'object' && ['anytime_td','first_td'].includes(value.propType)
    && typeof value.vendor === 'string' && value.vendor.length <= 128
    && typeof value.averageOdds === 'number' && Number.isFinite(value.averageOdds)
    && Number.isSafeInteger(value.sampleGames) && value.sampleGames >= 0
    && [value.averageProbability,value.currentProbability,value.deltaProbabilityPoints,value.deltaPct,value.deltaOdds].every(item => item === null || typeof item === 'number' && Number.isFinite(item))
    && [value.firstSampleDate,value.throughDate].every(item => item === null || typeof item === 'string')
}

/** Create a compact, capture-time diff without modifying either input. */
export function createNflPausedProjection(original: SidelineOddsBoard, current: SidelineOddsBoard, gameId: string): NflPausedProjection {
  if (!gameId || (original.bdlGameId != null && current.bdlGameId != null && original.bdlGameId !== current.bdlGameId)) throw new Error('Invalid NFL projection game')
  const result: NflPausedProjection = { gameId, bdlGameId: original.bdlGameId, capturedAt: current.capturedAt, status: current.status, source: current.source, ...(current.openingOnly ? { openingOnly: current.openingOnly } : {}), offers: [], lines: [], baselines: [] }
  const currentPlayers = new Map(current.players.map(player => [player.id, player]))
  if (currentPlayers.size !== current.players.length || new Set(original.players.map(player => player.id)).size !== original.players.length) throw new Error('Ambiguous NFL player identity')
  const originalPlayers = new Map(original.players.map(player => [player.id, player]))
  // A compact replacement cannot recreate a base-only identity that was
  // filtered or collapsed during merge. Keep the previous archive in that case.
  for (const player of current.players) {
    const sourcePlayer = originalPlayers.get(player.id)
    if (!sourcePlayer) throw new Error('Incomplete NFL projection base')
    for (const market of player.markets) {
      const sourceMarket = sourcePlayer.markets.find(entry => entry.key === market.key)
      if (!sourceMarket || market.offers.some(offer => !sourceMarket.offers.some(entry => entry.vendor === offer.vendor))) throw new Error('Incomplete NFL projection base')
    }
  }
  if (current.gameLines.some(line => !original.gameLines.some(entry => entry.vendor === line.vendor))) throw new Error('Incomplete NFL projection base')
  for (const player of original.players) {
    const base = currentPlayers.get(player.id)
    const markets = new Map(base?.markets.map(market => [market.key, market]) ?? [])
    if (markets.size !== (base?.markets.length ?? 0) || new Set(player.markets.map(market => market.key)).size !== player.markets.length) throw new Error('Ambiguous NFL market identity')
    if (!equal(player.tdBaselines ?? null, base?.tdBaselines ?? null)) result.baselines.push({ playerId: player.id, value: base?.tdBaselines ?? null })
    for (const market of player.markets) {
      const baseMarket = markets.get(market.key)
      const offers = new Map(baseMarket?.offers.map(offer => [offer.vendor, offer]) ?? [])
      if (offers.size !== (baseMarket?.offers.length ?? 0) || new Set(market.offers.map(offer => offer.vendor)).size !== market.offers.length) throw new Error('Ambiguous NFL offer identity')
      const sourceMetadata = { key: market.key, propType: market.propType, label: market.label, category: market.category, line: market.line }
      const baseMetadata = baseMarket ? { key: baseMarket.key, propType: baseMarket.propType, label: baseMarket.label, category: baseMarket.category, line: baseMarket.line } : null
      const metadata = equal(baseMetadata, sourceMetadata) ? null : baseMetadata
      for (const offer of market.offers) {
        const replacement = offers.get(offer.vendor) ?? null
        if (!equal(offer, replacement)) result.offers.push({ playerId: player.id, marketKey: market.key, vendor: offer.vendor, type: offer.type, line: offer.line, current: offer.current, updatedAt: offer.updatedAt, replacement, market: metadata })
      }
    }
  }
  const lines = new Map(current.gameLines.map(line => [line.vendor, line]))
  if (lines.size !== current.gameLines.length || new Set(original.gameLines.map(line => line.vendor)).size !== original.gameLines.length) throw new Error('Ambiguous NFL line identity')
  for (const line of original.gameLines) {
    const replacement = lines.get(line.vendor) ?? null
    if (!equal(line, replacement)) result.lines.push({ vendor: line.vendor, original: line, replacement })
  }
  return result
}

/** Resolve references against the same archived board, never today's source. */
export function projectNflPausedBoard(original: SidelineOddsBoard, marker: NflPausedProjection, gameId: string) {
  if (marker.gameId !== gameId || marker.bdlGameId !== original.bdlGameId) throw new Error('Invalid NFL projection game')
  const lastSeen: { playerId: number; name: string; team: string; label: string; propType: string; offer: NflMarketOffer }[] = []
  const lastSeenLines: NflGameLineBook[] = []
  const foundOffers = new Set<number>(), foundLines = new Set<number>(), foundBaselines = new Set<number>()
  const offerKey = (playerId: number, marketKey: string, vendor: string, type: string, line: number | null) => JSON.stringify([playerId, marketKey, vendor, type, line])
  const offerIndexes = new Map(marker.offers.map((entry, index) => [offerKey(entry.playerId, entry.marketKey, entry.vendor, entry.type, entry.line), index]))
  const lineIndexes = new Map(marker.lines.map((entry, index) => [entry.vendor, index]))
  const baselineIndexes = new Map(marker.baselines.map((entry, index) => [entry.playerId, index]))
  if (offerIndexes.size !== marker.offers.length || lineIndexes.size !== marker.lines.length || baselineIndexes.size !== marker.baselines.length) throw new Error('Ambiguous NFL paused projection')
  const players = original.players.map(player => {
    const baselineIndex = baselineIndexes.get(player.id) ?? -1
    if (baselineIndex >= 0) foundBaselines.add(baselineIndex)
    const markets = player.markets.map(market => {
      let metadata: Omit<NflPlayerMarket, 'offers'> | null = null
      const offers = market.offers.flatMap(offer => {
        const index = offerIndexes.get(offerKey(player.id, market.key, offer.vendor, offer.type, offer.line)) ?? -1
        if (index < 0) return [offer]
        if (foundOffers.has(index)) throw new Error('Ambiguous NFL paused projection')
        foundOffers.add(index)
        const change = marker.offers[index]
        if (!equal(change.current, offer.current) || change.updatedAt !== offer.updatedAt) throw new Error('Invalid NFL paused projection price')
        const effectiveMarket = change.market ?? market
        if (change.replacement && (effectiveMarket.key !== market.key
          || effectiveMarket.propType !== market.propType || change.replacement.line !== effectiveMarket.line
          || ![`${effectiveMarket.propType}:${effectiveMarket.line ?? ''}`, ...(effectiveMarket.line === null ? [`${effectiveMarket.propType}:null`] : [])].includes(effectiveMarket.key)
          || !validReplacement(change.replacement, offer.vendor))) throw new Error('Invalid NFL paused projection replacement')
        if (!change.replacement && change.market && (change.market.key !== market.key || change.market.propType !== market.propType)) throw new Error('Invalid NFL paused projection market')
        lastSeen.push({ playerId: player.id, name: player.name, team: player.team, label: market.label, propType: market.propType, offer })
        metadata = change.market
        return change.replacement ? [change.replacement] : []
      })
      return { ...market, ...(metadata ?? {}), offers }
    }).filter(market => market.offers.length)
    return { ...player, markets, ...(baselineIndex >= 0 ? { tdBaselines: marker.baselines[baselineIndex].value ?? undefined } : {}) }
  })
  const gameLines = original.gameLines.flatMap(line => {
    const index = lineIndexes.get(line.vendor) ?? -1
    if (index < 0) return [line]
    if (foundLines.has(index)) throw new Error('Ambiguous NFL paused projection')
    if (!equal(line, marker.lines[index].original)) throw new Error('Invalid NFL paused projection line')
    foundLines.add(index)
    lastSeenLines.push(line)
    const replacement = marker.lines[index].replacement
    if (replacement && (replacement.vendor !== line.vendor
      || !(replacement.updatedAt === null || typeof replacement.updatedAt === 'string' && Number.isFinite(Date.parse(replacement.updatedAt)))
      || ![replacement.spreadHome, replacement.spreadHomeOdds, replacement.spreadAway, replacement.spreadAwayOdds, replacement.moneylineHome, replacement.moneylineAway, replacement.total, replacement.totalOverOdds, replacement.totalUnderOdds].every(value => value === null || typeof value === 'number' && Number.isFinite(value)))) throw new Error('Invalid NFL paused projection line replacement')
    return replacement ? [replacement] : []
  })
  if (foundOffers.size !== marker.offers.length || foundLines.size !== marker.lines.length || foundBaselines.size !== marker.baselines.length) throw new Error('Invalid NFL paused projection')
  return { board: { ...original, players, gameLines, capturedAt: marker.capturedAt, status: marker.status, source: marker.source, ...(marker.openingOnly ? { openingOnly: marker.openingOnly } : {}) }, lastSeen, lastSeenLines }
}

/** Remove private projection metadata before returning any member payload. */
export function visibleNflObservedOdds(observed: NflObservedOdds, gameId: string, unmarkedOpenPaused = false): SidelineOddsBoard {
  const { pausedProjection, ...original } = observed
  if (!pausedProjection && !unmarkedOpenPaused) return { ...original, legacyUnverified: true }
  // An old pregame archive has no source provenance. During a hard pause it
  // cannot establish which prices are current; retain it as last seen until a
  // newly marked observation succeeds. Closed historical snapshots stay intact.
  const marker = pausedProjection ? unpackNflPausedProjection(pausedProjection) : createNflPausedProjection(original, {
    ...original, status: 'unavailable', source: 'none', capturedAt: null, gameLines: [],
    players: original.players.map(player => ({ ...player, markets: [], tdBaselines: undefined })),
  }, gameId)
  const { board, lastSeen, lastSeenLines } = projectNflPausedBoard(original, marker, gameId)
  return separateNflOpenings({ ...board, lastSeen: { offers: lastSeen, lines: lastSeenLines } })
}
