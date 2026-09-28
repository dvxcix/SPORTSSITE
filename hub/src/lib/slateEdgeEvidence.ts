import { NFL_SLATE_EDGE_MARKETS } from './nflSlateEdge'
export type SlateEdgeEvidenceWindow = 'l1' | 'l3' | 'l5' | 'l10' | 'season'
export type SlateEdgeEvidenceView = 'rankings' | 'matchups' | 'market' | 'signals'

export type SlateEdgeBookOffer = { book: string; price: number }
export type SlateEdgeMarketStep = { key: string; label: string; current: number | null; open: number | null }

export type SlateEdgeEvidence = {
  sport?: 'MLB' | 'NFL'
  nfl?: { entry: import('./nflSlateEdge').NflSlateEdgeEntry; focus: import('./nflSlateEdge').NflSlateEdgeMarketKey; sampleLabel: string }
  version: 1
  kind: 'slate_edge_player'
  capturedAt: string
  source: { path: string; date: string; window: SlateEdgeEvidenceWindow; view: SlateEdgeEvidenceView; gameKey: string; playerId: number | null }
  snapshot: {
    name: string; team: string; position: string; battingOrder: number | null; awayAbbr: string; homeAbbr: string
    rank: number; edge: number | null; marketScore: number | null; marketOverlay: number | null; score: number | null
    tags: string[]; hr: number | null; hrBaseline: number | null; fhr: number | null; fhrBaseline: number | null
    scoreConfidence?: number | null
    modelRank?: number | null
    bookRank?: number | null
    mm?: number | null
    pitchFit?: number | null
    barrelRecent?: number | null
    barrelDelta?: number | null
    hardHitDelta?: number | null
    pullAirRecent?: number | null
    pullAirDelta?: number | null
    timingDelta?: number | null
    hrOpen?: number | null
    fhrOpen?: number | null
    hrBooks?: SlateEdgeBookOffer[]
    marketLadder?: SlateEdgeMarketStep[]
    publicPicks?: number | null
  }
}

export type SocialAttachment = SlateEdgeEvidence

export function isSlateEdgeEvidence(value: unknown): value is SlateEdgeEvidence {
  if (!value || typeof value !== 'object') return false
  const evidence = value as Partial<SlateEdgeEvidence>
  if (evidence.sport === 'NFL') {
    const entry = evidence.nfl?.entry
    if (!entry || typeof entry.name !== 'string' || typeof entry.team !== 'string' || typeof entry.gameLabel !== 'string'
      || !NFL_SLATE_EDGE_MARKETS.some(market => market.key === evidence.nfl?.focus)
      || !NFL_SLATE_EDGE_MARKETS.every(({ key }) => entry.markets?.[key]
        && (entry.markets[key].odds === null || Number.isFinite(entry.markets[key].odds))
        && entry.score && entry.mm)) return false
  }
  return evidence.version === 1
    && evidence.kind === 'slate_edge_player'
    && typeof evidence.capturedAt === 'string'
    && typeof evidence.source?.path === 'string'
    && (evidence.sport === 'NFL' ? /^\/the-sideline(?:\?|$)/.test(evidence.source.path) && !!evidence.nfl?.entry && !!evidence.nfl?.focus : /^\/dugout(?:\?|$)/.test(evidence.source.path))
    && !evidence.source.path.startsWith('//')
    && typeof evidence.snapshot?.name === 'string'
    && typeof evidence.snapshot?.rank === 'number'
}
