import { NextResponse } from 'next/server'
import { getSidelineGames, getSidelineMarketCapture, getSidelineTimeline } from '@/app/the-sideline/data'
import { requireNflAccess } from './nflAccess'
import { ladderOffers, ladderPrice } from './nflLadders'
import { americanImpliedProbability } from './nflMarketMath'
import { publicWorkspaceGames } from './publicWorkspaceScope'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })

export async function getNativeSidelineArchive(request: Request, accountId: string) {
  const gate = await requireNflAccess()
  if (gate.error) return gate.error
  if (gate.userId !== accountId) return reply({ error: 'NFL access unavailable' }, 403)
  const params = new URL(request.url).searchParams
  const gameId = params.get('game'), rawAt = params.get('at'), player = params.get('player')
  const book = params.get('book') ?? 'fanduel', market = params.get('market') ?? 'receiving_yards'
  const kind = params.get('kind') ?? 'milestone', side = params.get('side') ?? 'over'
  const wanted = rawAt != null ? Date.parse(rawAt) : null
  if (!/^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(gameId ?? '') ||
      wanted != null && (!Number.isFinite(wanted) || rawAt!.length > 40) ||
      player != null && !/^[1-9]\d{0,9}$/.test(player) || !/^[a-z0-9_]{1,40}$/.test(book) ||
      !/^[a-z0-9_]{1,60}$/.test(market) || !['milestone', 'over_under'].includes(kind) ||
      !['over', 'under'].includes(side) || kind === 'milestone' && side === 'under') {
    return reply({ error: 'Choose a valid matchup, market and capture' }, 400)
  }
  try {
    const slate = await getSidelineGames(undefined, gameId!)
    const game = publicWorkspaceGames(slate.games, 'nfl').find(candidate => candidate.id === gameId)
    if (!game) return reply({ error: 'Matchup not found' }, 404)
    const captures = (await getSidelineTimeline(game)).filter(at => Date.parse(at) <= Date.now())
    // Only select from the original, cutoff-bounded capture index.
    const selectedAt = wanted == null ? captures.at(-1) : captures.findLast(at => Date.parse(at) <= wanted)
    const frame = selectedAt ? await getSidelineMarketCapture(game, selectedAt) : null
    const board = frame?.board
    const quoteSide = side === 'under' ? 'under' : 'over'
    const players = (board?.players ?? []).filter(row => player == null || row.id === Number(player))
    const markets = [...new Set((board?.players ?? []).flatMap(row => row.markets.map(item => item.propType)))].sort()
    const books = [...new Set((board?.players ?? []).flatMap(row => row.markets.flatMap(item => item.offers.map(offer => offer.vendor))))].sort()
    const rows = players.flatMap(row => {
      const seen = new Set<number>()
      const contracts = ladderOffers(row, market, book, quoteSide).flatMap(({ market: item, offer, line }) => {
        if (offer.type !== kind || line == null || seen.has(line)) return []
        seen.add(line)
        const price = offer.isOpeningOnly ? null : ladderPrice(offer, quoteSide)
        const opening = offer.isOpeningOnly ? ladderPrice(offer, quoteSide, true) ?? ladderPrice(offer, quoteSide) : ladderPrice(offer, quoteSide, true)
        const current = americanImpliedProbability(price), first = americanImpliedProbability(opening)
        return [{ line, label: item.label, price, opening, openLine: offer.openingLine ?? null, observedAt: offer.updatedAt,
          movement: current != null && first != null && line === offer.openingLine ? (current - first) * 100 : null }]
      })
      return contracts.length ? [{ id: row.id, name: row.name, team: row.team, position: row.position,
        portraits: [row.headshot, ...(row.headshotFallbacks ?? [])].filter(Boolean), contracts }] : []
    })
    return reply({ gameId, date: game.gameday, market, book, kind, side, captures, selectedAt: selectedAt ?? null,
      observedAt: board?.capturedAt ?? null, legacy: board?.legacyUnverified === true, books, markets, rows })
  } catch {
    return reply({ error: 'NFL market archive unavailable' }, 503)
  }
}
