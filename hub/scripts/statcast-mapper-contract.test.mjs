import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const mappers = [
  'src/lib/statcastPitchLogSync.ts',
  'scripts/backfill-statcast-pitch-log.mjs',
  'scripts/manual-sync-pitch-log.mjs',
  'scripts/diagnose-pitch-log-gap.mjs',
]
const required = [
  'pitch_type:', 'velocity:', 'spin_rate:', 'pfx_x:', 'pfx_z:', 'balls:', 'strikes:',
  'inning:', 'top_bottom:', 'zone:', 'events:', 'description:', 'is_in_play:', 'is_swing:',
  'is_whiff:', 'is_home_run:', 'launch_speed:', 'launch_angle:', 'hc_x:', 'hc_y:',
  'hit_distance:', 'bb_type:', 'xwoba:', 'bat_speed:', 'plate_x:', 'plate_z:', 'stand:',
  'p_throws:', 'run_value:', 'attack_angle:', 'swing_length:', 'swing_path_tilt:',
  'attack_direction:', 'launch_speed_angle:', 'raw:',
]

for (const mapper of mappers) {
  const source = readFileSync(`${root}/${mapper}`, 'utf8')
  const missing = required.filter(field => !source.includes(field))
  assert.deepEqual(missing, [], `${mapper} is missing materialized fields: ${missing.join(', ')}`)
}

console.log(`Statcast mapper contract passed for ${mappers.length} ingestion paths.`)
