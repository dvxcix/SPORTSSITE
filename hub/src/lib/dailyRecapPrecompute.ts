import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

// Every real home run for a date, straight off player_pitch_log — the same
// authoritative, backfillable Statcast source savant-sync-pitch-log writes
// (see pitchLogAlert.ts for why this specific table is trusted to actually
// be current). Deliberately NOT the live hrFeed helper in dugout/data/
// route.ts — that one only works for today's in-progress/just-finished
// games (hits MLB's live playByPlay endpoint), has no persisted history,
// and carries no pitch_type/pitcher-hand. pitch_log works identically for
// today-so-far and any past date, which is what backfill actually needs.
export async function precomputeDailyRecapForDate(admin: AdminClient, date: string): Promise<{ date: string; hrs: number }> {
  const season = Number(date.slice(0, 4))

  const { data: hrRows, error: hrErr } = await admin
    .from('player_pitch_log')
    .select('game_pk, at_bat_index, inning, top_bottom, pitch_type, pitcher_id, batter_id, p_throws, launch_speed, launch_angle, raw')
    .eq('season', season)
    .eq('game_date', date)
    .eq('is_home_run', true)
    .order('game_pk', { ascending: true })
    .order('at_bat_index', { ascending: true })
  if (hrErr) throw hrErr
  if (!hrRows?.length) return { date, hrs: 0 }

  // FHR = first home run of the GAME (either team) — the same market
  // Dugout's own FHR odds price. First row per game_pk in at_bat_index
  // order is that game's FHR winner.
  const seenGamePk = new Set<string>()
  const withFhr = hrRows.map(r => {
    const isFhr = !seenGamePk.has(r.game_pk)
    seenGamePk.add(r.game_pk)
    return { ...r, isFhr }
  })

  const batterIds = Array.from(new Set(withFhr.map(r => r.batter_id)))
  const pitcherIds = Array.from(new Set(withFhr.map(r => r.pitcher_id)))
  const gamePks = Array.from(new Set(withFhr.map(r => r.game_pk)))

  const [playersRes, gamesRes, statcastRes, pitchlogRes] = await Promise.all([
    admin.from('players').select('mlb_id, full_name, bat_side, current_team_abbr').in('mlb_id', Array.from(new Set([...batterIds, ...pitcherIds]))),
    admin.from('games').select('game_pk, home_team, away_team, venue_name').in('game_pk', gamePks),
    admin.from('dugout_statcast_precomputed').select('mlb_id, pitcher_hand, windows').eq('game_date', date).in('mlb_id', batterIds),
    admin.from('dugout_pitchlog_stat_precomputed').select('mlb_id, pitcher_hand, windows').eq('game_date', date).in('mlb_id', batterIds),
  ])

  const playerById = new Map((playersRes.data ?? []).map(p => [p.mlb_id, p]))
  const gameByPk = new Map((gamesRes.data ?? []).map(g => [g.game_pk, g]))
  const statcastByBatterHand = new Map<string, any>()
  for (const r of statcastRes.data ?? []) statcastByBatterHand.set(`${r.mlb_id}-${r.pitcher_hand}`, r.windows)
  const pitchlogByBatterHand = new Map<string, any>()
  for (const r of pitchlogRes.data ?? []) pitchlogByBatterHand.set(`${r.mlb_id}-${r.pitcher_hand}`, r.windows)

  const rows = withFhr.map(r => {
    const batter = playerById.get(r.batter_id)
    const pitcher = playerById.get(r.pitcher_id)
    const game = gameByPk.get(r.game_pk)
    const hand = (r.p_throws || 'R') as 'L' | 'R'
    const rawRow = r.raw as Record<string, string> | null

    return {
      season, game_date: date, game_pk: r.game_pk, mlb_id: r.batter_id,
      player_name: batter?.full_name ?? null, team: batter?.current_team_abbr ?? null,
      opp_team: null, // resolving this batter's specific side reliably needs a lineup join this precompute doesn't have; the game matchup itself (home/away) is in row_data.game
      pitcher_id: r.pitcher_id, pitcher_name: pitcher?.full_name ?? null, pitcher_hand: hand,
      is_fhr: r.isFhr, inning: r.inning, half_inning: r.top_bottom, pitch_type: r.pitch_type,
      exit_velocity: r.launch_speed, launch_angle: r.launch_angle,
      hit_distance: rawRow?.hit_distance_sc ? Number(rawRow.hit_distance_sc) : null,
      at_bat_index: r.at_bat_index,
      row_data: {
        batter: { mlbId: r.batter_id, name: batter?.full_name ?? `Player ${r.batter_id}`, team: batter?.current_team_abbr ?? null, bats: batter?.bat_side ?? null },
        pitcher: { mlbId: r.pitcher_id, name: pitcher?.full_name ?? `Player ${r.pitcher_id}`, hand },
        game: { gamePk: r.game_pk, homeTeam: game?.home_team ?? null, awayTeam: game?.away_team ?? null, venue: game?.venue_name ?? null },
        hr: {
          inning: r.inning, half: r.top_bottom, pitchType: r.pitch_type, isFhr: r.isFhr,
          exitVelocity: r.launch_speed, launchAngle: r.launch_angle,
          hitDistance: rawRow?.hit_distance_sc ? Number(rawRow.hit_distance_sc) : null,
          hitBearing: rawRow?.hc_x && rawRow?.hc_y ? { x: Number(rawRow.hc_x), y: Number(rawRow.hc_y) } : null,
        },
        // Same precomputed windows Dugout's own live board reads for this
        // exact (date, batter, pitcher-hand) — not a re-derivation, so
        // these specific numbers match what the board actually showed.
        statcastWindows: statcastByBatterHand.get(`${r.batter_id}-${hand}`) ?? null,
        pitchlogWindows: pitchlogByBatterHand.get(`${r.batter_id}-${hand}`) ?? null,
      },
      computed_at: new Date().toISOString(),
    }
  })

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin.from('daily_recap_hr').upsert(rows.slice(i, i + CHUNK), { onConflict: 'game_pk,mlb_id,at_bat_index' })
    if (error) throw error
  }

  return { date, hrs: rows.length }
}
