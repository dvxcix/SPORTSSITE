import { nbaMovement, type PaintFrame } from './nbaMovement'
import type { NbaPublicCapture } from './nbaPublic'
import type { PaintMarket } from './nbaPaint'
import type { NbaQuoteOpeningRow } from './nbaOddsHistory'
const markets: PaintMarket[] = ['points', 'threes', 'rebounds', 'assists']
export function nbaDivergences(frames: PaintFrame[], publicCaptures: NbaPublicCapture[], openingRows: NbaQuoteOpeningRow[] = []) {
  const ordered = [...frames].sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at))
  if (ordered.length < 2) return []
  const latest = ordered.at(-1)!, earliest = ordered[0]
  const gameId = latest.props[0]?.game_id
  const publicSample = [...publicCaptures].filter(capture => capture.gameId === gameId && Date.parse(capture.capturedAt) <= Date.parse(latest.captured_at) && Date.parse(capture.capturedAt) >= Date.parse(earliest.captured_at)).sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))[0]
  const candidates = [...new Map(latest.props.filter(prop => markets.includes(prop.prop_type as PaintMarket)).map(prop => [`${prop.player_id}:${prop.vendor}`, { playerId: prop.player_id, book: prop.vendor }])).values()]
  return candidates.flatMap(candidate => {
    const movements = markets.map(market => ({ market, value: nbaMovement(ordered, candidate.playerId, market, candidate.book, 'over', openingRows) }))
    return movements.flatMap((a, index) => movements.slice(index + 1).flatMap(b => {
      const priceOpposed = a.value.priceChange != null && b.value.priceChange != null && Math.abs(a.value.priceChange) >= .25 && Math.abs(b.value.priceChange) >= .25 && a.value.priceChange * b.value.priceChange < 0
      const lineOpposed = a.value.lineChange != null && b.value.lineChange != null && a.value.lineChange * b.value.lineChange < 0
      if (!priceOpposed && !lineOpposed) return []
      const primary = priceOpposed ? a.value.priceChange! < 0 ? a : b : a.value.lineChange! > 0 ? a : b
      const other = primary === a ? b : a
      const count = (market: PaintMarket) => publicSample?.rows.find(row => row.playerId === candidate.playerId && row.market === market)?.picks ?? null
      const primaryPicks = count(primary.market), otherPicks = count(other.market)
      return [{ ...candidate, kind: priceOpposed ? 'price' as const : 'line' as const, primary: primary.market, other: other.market,
        primaryMovement: primary.value, otherMovement: other.value, primaryPicks, otherPicks,
        publicHeavierElsewhere: primaryPicks != null && otherPicks != null ? otherPicks > primaryPicks : null,
        publicCapturedAt: publicSample?.capturedAt ?? null, firstAt: earliest.captured_at, latestAt: latest.captured_at }]
    }))
  }).sort((a, b) => Number(b.publicHeavierElsewhere) - Number(a.publicHeavierElsewhere) || Math.abs(b.primaryMovement.priceChange ?? b.primaryMovement.lineChange ?? 0) - Math.abs(a.primaryMovement.priceChange ?? a.primaryMovement.lineChange ?? 0))
}
