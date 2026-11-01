import assert from 'node:assert/strict'
import test from 'node:test'
import { ownOnboardingComplete } from '../src/lib/supabase/ownOnboarding'

test('each request reads only the current caller state, without a target or cache', async () => {
  let complete = false
  const args: unknown[][] = []
  const client = { rpc: async (...values: unknown[]) => { args.push(values); return { data: complete, error: null } } } as never
  assert.equal(await ownOnboardingComplete(client), false)
  complete = true
  assert.equal(await ownOnboardingComplete(client), true)
  assert.deepEqual(args, [['get_own_onboarding_complete'], ['get_own_onboarding_complete']])
})

test('outages and malformed responses fail closed', async () => {
  for (const result of [{ data: null, error: {} }, { data: null, error: null }, { data: 'true', error: null }]) {
    await assert.rejects(ownOnboardingComplete({ rpc: async () => result } as never))
  }
  await assert.rejects(ownOnboardingComplete({ rpc: async () => { throw new Error('offline') } } as never))
})
