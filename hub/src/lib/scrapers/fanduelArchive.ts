import { createHash } from 'node:crypto'

export type FanduelScrapeOutcome = {
  selection?: string | null
  odds?: string | null
  parts?: string[] | null
  market_hint?: string | null
  format?: string | null
  aria_label?: string | null
}

export type FanduelScrapeResult = {
  sportsbook?: string | null
  scraped_at?: string | null
  event?: {
    title?: string | null
    slug?: string | null
    event_id?: string | null
    url?: string | null
  } | null
  active_tab?: { label?: string | null } | null
  section_count?: number | null
  outcome_count?: number | null
  sections: Record<string, FanduelScrapeOutcome[]>
}

export type FanduelCaptureRow = {
  capture_key: string
  game_date: string
  game_key: string
  sportsbook: string
  event_id: string | null
  event_title: string | null
  event_slug: string | null
  event_url: string | null
  tab_label: string
  scraped_at: string
  section_count: number
  outcome_count: number
  raw_sections: Record<string, FanduelScrapeOutcome[]>
  source: string
}

export type FanduelOutcomeRow = {
  outcome_key: string
  capture_key: string
  game_date: string
  game_key: string
  tab_label: string
  section_name: string
  market_hint: string | null
  selection: string
  selection_norm: string
  odds: number
  odds_raw: string
  parts: string[]
  aria_label: string | null
  outcome_format: string | null
  scraped_at: string
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function parseFanduelOdds(value: string | null | undefined): number | null {
  const raw = String(value ?? '').trim()
  if (/^even$/i.test(raw)) return 100
  if (!/^[+-]\d{2,5}$/.test(raw)) return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeMarketText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function validTimestamp(value: string | null | undefined, fallback: string) {
  if (!value) return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString()
}

/**
 * Converts one exact FanDuel tab capture into a lossless capture row and
 * queryable outcome rows. This does not interpret markets or player names;
 * new/renamed FanDuel markets therefore remain available for later ratios.
 */
export function buildFanduelArchiveRows(
  scrape: FanduelScrapeResult,
  context: { gameDate: string; gameKey: string; importedAt?: string },
): { capture: FanduelCaptureRow; outcomes: FanduelOutcomeRow[] } {
  const importedAt = context.importedAt ?? new Date().toISOString()
  const scrapedAt = validTimestamp(scrape.scraped_at, importedAt)
  const sections = scrape.sections && typeof scrape.sections === 'object' ? scrape.sections : {}
  const tabLabel = String(scrape.active_tab?.label || '(unknown tab)').trim() || '(unknown tab)'
  const sportsbook = String(scrape.sportsbook || 'FanDuel').trim() || 'FanDuel'
  const eventId = scrape.event?.event_id ? String(scrape.event.event_id) : null
  const eventTitle = scrape.event?.title ? String(scrape.event.title) : null
  const eventSlug = scrape.event?.slug ? String(scrape.event.slug) : null
  const eventUrl = scrape.event?.url ? String(scrape.event.url) : null
  const sectionEntries = Object.entries(sections)
  const rawOutcomeCount = sectionEntries.reduce(
    (sum, [, outcomes]) => sum + (Array.isArray(outcomes) ? outcomes.length : 0),
    0,
  )
  const captureKey = hash(JSON.stringify({
    gameDate: context.gameDate,
    gameKey: context.gameKey,
    eventId,
    tabLabel,
    scrapedAt,
    sections,
  }))

  const capture: FanduelCaptureRow = {
    capture_key: captureKey,
    game_date: context.gameDate,
    game_key: context.gameKey,
    sportsbook,
    event_id: eventId,
    event_title: eventTitle,
    event_slug: eventSlug,
    event_url: eventUrl,
    tab_label: tabLabel,
    scraped_at: scrapedAt,
    section_count: sectionEntries.length,
    outcome_count: rawOutcomeCount,
    raw_sections: sections,
    source: 'browserbase',
  }

  const outcomes: FanduelOutcomeRow[] = []
  for (const [sectionName, sectionOutcomes] of sectionEntries) {
    if (!Array.isArray(sectionOutcomes)) continue
    sectionOutcomes.forEach((outcome, index) => {
      const oddsRaw = String(outcome?.odds ?? '').trim()
      const odds = parseFanduelOdds(oddsRaw)
      if (odds == null) return
      const parts = Array.isArray(outcome?.parts)
        ? outcome.parts.map(part => String(part))
        : []
      const selection = String(
        outcome?.selection || parts.slice(1).join(' | ') || parts[0] || outcome?.aria_label || '(unlabeled outcome)',
      ).trim()
      const outcomeKey = hash(JSON.stringify({
        captureKey,
        sectionName,
        index,
        selection,
        oddsRaw,
        ariaLabel: outcome?.aria_label ?? null,
      }))
      outcomes.push({
        outcome_key: outcomeKey,
        capture_key: captureKey,
        game_date: context.gameDate,
        game_key: context.gameKey,
        tab_label: tabLabel,
        section_name: sectionName,
        market_hint: outcome?.market_hint ? String(outcome.market_hint) : null,
        selection,
        selection_norm: normalizeMarketText(selection),
        odds,
        odds_raw: oddsRaw,
        parts,
        aria_label: outcome?.aria_label ? String(outcome.aria_label) : null,
        outcome_format: outcome?.format ? String(outcome.format) : null,
        scraped_at: scrapedAt,
      })
    })
  }

  return { capture, outcomes }
}
