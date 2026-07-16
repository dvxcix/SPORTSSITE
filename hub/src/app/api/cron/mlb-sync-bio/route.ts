import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { MLB_SPORT_ID, currentSeason, claimBatch, markSyncState, seedPending, fetchMlbJson } from '@/lib/playerSync'
import { mlbTeamAbbrById } from '@/lib/mlbTeams'

export const revalidate = 0
export const maxDuration = 60

const BIO_BATCH_SIZE = 30
const ROSTER_SEED_STALE_HOURS = 20

// Two phases per tick:
// 1. Roster seed (at most once per ~20h, cheap upserts only) — pulls the
//    full active-player list so every current player has a `players` row
//    and a pending player_bio job, catching call-ups/new signings without
//    re-fetching ~1500 individual bio pages every single day.
// 2. Per-player bio detail — claims a batch of pending/stale player_bio
//    jobs, fetches each player's real bio, and on success seeds that
//    player's season_stats/career_stats jobs so mlb-sync-season-stats and
//    mlb-sync-career-stats have something to claim without their own
//    separate seeding step.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const season = currentSeason()

  const rosterSeeded = await seedRosterIfStale(admin, season)

  const claimed = await claimBatch(admin, 'player_bio', 0, BIO_BATCH_SIZE)
  let synced = 0
  let failed = 0

  await Promise.all(claimed.map(async ({ entity_id: mlbIdStr }) => {
    const mlbId = Number(mlbIdStr)
    try {
      // hydrate=currentTeam is required — confirmed live that the bare
      // /people/{id} endpoint omits currentTeam entirely (unlike the bulk
      // roster endpoint used for seeding), which silently left every
      // synced player's team null.
      const data = await fetchMlbJson(`https://statsapi.mlb.com/api/v1/people/${mlbId}?hydrate=currentTeam`)
      const person = data.people?.[0]
      if (!person) throw new Error('no person in response')

      const teamId: number | null = person.currentTeam?.id ?? null
      const { error } = await admin.from('players').upsert({
        mlb_id: mlbId,
        full_name: person.fullName,
        first_name: person.firstName ?? null,
        last_name: person.lastName ?? null,
        birth_date: person.birthDate ?? null,
        height: person.height ?? null,
        weight: person.weight ?? null,
        bat_side: person.batSide?.code ?? null,
        pitch_hand: person.pitchHand?.code ?? null,
        primary_position: person.primaryPosition?.abbreviation ?? null,
        current_team_id: teamId,
        current_team_abbr: teamId ? (mlbTeamAbbrById(teamId) ?? null) : null,
        mlb_debut: person.mlbDebutDate ?? null,
        active: person.active ?? true,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'mlb_id' })
      if (error) throw error

      await markSyncState(admin, 'player_bio', String(mlbId), 0, 'mlb_complete')
      await Promise.all([
        seedPending(admin, 'season_stats', String(mlbId), season),
        seedPending(admin, 'career_stats', String(mlbId), 0),
      ])
      synced++
    } catch (e) {
      console.error('[mlb-sync-bio] player fetch failed', mlbId, e)
      await markSyncState(admin, 'player_bio', String(mlbId), 0, 'error')
      failed++
    }
  }))

  return NextResponse.json({ season, rosterSeeded, claimed: claimed.length, synced, failed })
}

async function seedRosterIfStale(admin: ReturnType<typeof createAdminClient>, season: number): Promise<boolean> {
  const { data: job } = await admin
    .from('sync_state')
    .select('last_synced_at')
    .eq('source', 'mlb_stats_api').eq('entity_type', 'job').eq('entity_id', 'roster_seed').eq('season', season)
    .maybeSingle()

  const staleBefore = Date.now() - ROSTER_SEED_STALE_HOURS * 60 * 60_000
  if (job?.last_synced_at && new Date(job.last_synced_at).getTime() > staleBefore) return false

  const data = await fetchMlbJson(`https://statsapi.mlb.com/api/v1/sports/${MLB_SPORT_ID}/players?season=${season}`)
  const people: any[] = data.people ?? []

  // Minimal row per player — full bio detail fills in via the per-player
  // fetch above; ignoreDuplicates so an already-synced player's real bio
  // never gets clobbered back down to this bare-bones shape.
  await admin.from('players').upsert(
    people.map(p => ({ mlb_id: p.id, full_name: p.fullName, active: p.active ?? true })),
    { onConflict: 'mlb_id', ignoreDuplicates: true }
  )
  // One bulk upsert, not ~1500 individual seedPending() round trips — that
  // many concurrent outbound requests from a single invocation blew past
  // the function's file descriptor limit (EMFILE) and took the rest of the
  // run down with it, confirmed live in production logs.
  await admin.from('sync_state').upsert(
    people.map(p => ({ source: 'mlb_stats_api', entity_type: 'player_bio', entity_id: String(p.id), season: 0, status: 'pending' })),
    { onConflict: 'source,entity_type,entity_id,season', ignoreDuplicates: true }
  )

  await admin.from('sync_state').upsert({
    source: 'mlb_stats_api', entity_type: 'job', entity_id: 'roster_seed', season,
    status: 'mlb_complete', last_synced_at: new Date().toISOString(),
  }, { onConflict: 'source,entity_type,entity_id,season' })

  return true
}
