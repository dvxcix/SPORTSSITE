import type { Page, Request as BrowserRequest, Response as BrowserResponse } from 'playwright-core'
import { createAdminClient } from './supabase/admin'
import { nbaPublicEventIdentities, type NbaPublicEventIdentity } from './nbaPublicEventIdentity'
import { parsePikkitGameOverview, pikkitOverviewEventId, pikkitEventIdPattern } from './pikkitGameOverview'

type Sport = 'nba' | 'nfl'
type Observed = { observedAt: number; overview: NonNullable<ReturnType<typeof parsePikkitGameOverview>> }
const team = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
const sameName = (a: string, b: string) => !!team(a) && team(a) === team(b)

export function observePikkitGameOverview(page: Page, sport: Sport) {
  const requests = new Set<BrowserRequest>()
  const overviews = new Map<string, Observed>()
  const nflEvents: NbaPublicEventIdentity[] = []
  let active = true
  const watch = (request: BrowserRequest) => {
    const url = request.url()
    if (requests.size >= 40) return
    if (pikkitOverviewEventId(url) || sport === 'nfl' && /^https:\/\/prod-website\.pikkit\.app\/event\/[a-z0-9-]{1,80}$/.test(url)) requests.add(request)
  }
  const read = (response: BrowserResponse) => {
    if (!requests.delete(response.request()) || response.status() !== 200) return
    const observedAt = Date.now()
    const id = pikkitOverviewEventId(response.url())
    void response.json().then(payload => {
      if (!active) return
      if (!id) {
        nflEvents.push(...nbaPublicEventIdentities(response.url(), payload, 'NFL'))
        return
      }
      const overview = parsePikkitGameOverview(payload)
      if (overview && observedAt >= (overviews.get(id)?.observedAt ?? 0)) overviews.set(id, { observedAt, overview })
    }).catch(() => undefined)
  }
  page.on('request', watch)
  page.on('response', read)
  return {
    nflIdentity(away: string, home: string, kickoff: number): NbaPublicEventIdentity | null {
      const url = new URL(page.url())
      const id = url.pathname.replace(/^\/event\//, '').replace(/\/$/, '')
      if (url.origin !== 'https://app.pikkit.com' || !pikkitEventIdPattern.test(id)
        || url.pathname.replace(/\/$/, '') !== '/event/' + id) return null
      const matching = nflEvents.filter(event => event.id === id)
      if (!matching.length || matching.some(event => Date.parse(event.start) !== kickoff
        || !sameName(away, event.away.full) || !sameName(home, event.home.full))) return null
      return matching[0]
    },
    find(identity: NbaPublicEventIdentity): Observed | null {
      const candidate = overviews.get(identity.id)
      if (!candidate || candidate.observedAt >= Date.parse(identity.start)) return null
      // The verified NBA identity can use Pikkit's alternate Clippers name.
      return sameName(candidate.overview.away, identity.away.full) && sameName(candidate.overview.home, identity.home.full)
        ? candidate : null
    },
    dispose() {
      active = false
      page.off('request', watch)
      page.off('response', read)
    },
  }
}

export async function savePikkitGameOverview(sport: Sport, gameId: string, identity: NbaPublicEventIdentity, observed: Observed) {
  try {
    const { error, data } = await createAdminClient().rpc('record_pikkit_pregame_overview', {
      p_sport: sport, p_game_id: gameId, p_event_id: identity.id,
      p_observed_at: new Date(observed.observedAt).toISOString(),
      p_source_start: identity.start,
      p_snapshot: observed.overview,
    }).abortSignal(AbortSignal.timeout(3500))
    if (!error && data === true) return
    console.warn('[pikkit-game-overview] archive unavailable', { sport, gameId, rejected: !error })
  } catch {
    console.warn('[pikkit-game-overview] archive unavailable', { sport, gameId })
  }
}

