export type SlateEdgeEvidenceWindow = 'l1' | 'l3' | 'l5' | 'l10'
export type SlateEdgeEvidenceView = 'rankings' | 'matchups' | 'market' | 'signals'

export type SlateEdgeBookOffer = { book: string; price: number }
export type SlateEdgeMarketStep = { key: string; label: string; current: number | null; open: number | null }

export type SlateEdgeEvidence = {
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
  return evidence.version === 1
    && evidence.kind === 'slate_edge_player'
    && typeof evidence.capturedAt === 'string'
    && typeof evidence.source?.path === 'string'
    && evidence.source.path.startsWith('/dugout')
    && !evidence.source.path.startsWith('//')
    && typeof evidence.snapshot?.name === 'string'
    && typeof evidence.snapshot?.rank === 'number'
}
