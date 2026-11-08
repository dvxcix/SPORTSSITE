import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { nextNflRecoveryBatch, nflRecoveryReservation } from '../src/lib/nflNov8BrowserRecovery'

const now = Date.parse('2026-11-08T18:00:00Z')
const batch = ['2026_09_HOU_LAC', '2026_09_LV_SF', '2026_09_ARI_SEA', '2026_09_GB_NE']
const evening = '2026_09_TB_CHI'

test('a recovery slot binds to one direct game or one exact public batch', () => {
  const ids = batch.map(game => nflRecoveryReservation('fanduel', [game], now))
  assert.equal(new Set(ids).size, 4)
  assert.ok(ids.every(Boolean))
  assert.ok(nflRecoveryReservation('public', [...batch].reverse(), now))
  assert.ok(nflRecoveryReservation('public', [evening], now))
  assert.ok(nflRecoveryReservation('fanduel', [evening], now))
  assert.equal(nflRecoveryReservation('public', batch.slice(0, 3), now), undefined)
  assert.equal(nflRecoveryReservation('public', [...batch.slice(0, 3), batch[0]], now), undefined)
  assert.equal(nflRecoveryReservation('fanduel', ['2026_09_NYJ_KC'], now), undefined)
  assert.equal(nflRecoveryReservation('public', batch, Date.parse('2026-11-08T17:29:59Z')), undefined)
  assert.equal(nflRecoveryReservation('fanduel', [evening], Date.parse('2026-11-09T01:20:00Z')), undefined)
})

test('schedulers select only unused database-approved slots in order', async () => {
  const direct = nflRecoveryReservation('fanduel', [batch[1]], now)
  const group = nflRecoveryReservation('public', batch, now)
  const late = nflRecoveryReservation('public', [evening], now)
  let reads = 0
  const admin = {
    rpc(name: string) {
      assert.equal(name, 'pending_nfl_nov8_browserbase_recovery')
      reads++
      return { abortSignal: async () => ({ data: [late, group, direct], error: null }) }
    },
  } as unknown as SupabaseClient
  assert.deepEqual((await nextNflRecoveryBatch(admin, 'fanduel', now))?.games, [batch[1]])
  assert.deepEqual((await nextNflRecoveryBatch(admin, 'public', now))?.games, batch)
  assert.equal(await nextNflRecoveryBatch(admin, 'public', Date.parse('2026-11-09T01:20:00Z')), undefined)
  assert.equal(reads, 2)
  const retry = '12baecb9-7146-42ed-98a6-ac5963070f57'
  assert.equal(nflRecoveryReservation('fanduel', [batch[1]], now, retry), retry)
  assert.equal(nflRecoveryReservation('fanduel', [batch[0]], now, retry), undefined)
  assert.equal(nflRecoveryReservation('public', batch, now, retry), undefined)
})
