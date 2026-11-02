import assert from 'node:assert/strict'
import test from 'node:test'
import { effectiveTier, hasFullAccessOverride, hasTierAccess, type Tier } from '../packages/core/src/tiers.ts'
import { hasNbaAccess } from '../src/lib/nbaAccessPolicy.ts'
import { hasNflAccess } from '../src/lib/nflAccessPolicy.ts'

test('Discord pricing eligibility alone cannot unlock legacy paid access', () => {
  for (const claim of [true, false, null, undefined]) {
    const tier = effectiveTier('free', claim)
    assert.equal(tier, 'free')
    assert.equal(hasTierAccess(tier, 'basic'), false)
    assert.equal(hasTierAccess(tier, 'advanced'), false)
    assert.equal(hasNbaAccess({ tier, discord_advanced_claimed: claim }), false)
    assert.equal(hasNflAccess('user', false, tier), false)
  }
})

test('purchased and manually granted tiers do not depend on the Discord claim', () => {
  for (const claim of [true, false, null, undefined]) {
    for (const raw of ['free', 'basic', 'advanced', 'ultimate'] as Tier[]) {
      assert.equal(effectiveTier(raw, claim), raw)
      assert.equal(effectiveTier(raw, claim, 'ultimate'), 'ultimate')
    }
    assert.equal(effectiveTier('advanced', claim, 'basic'), 'advanced')
    const ultimate = effectiveTier('ultimate', claim)
    assert.equal(hasNbaAccess({ tier: ultimate, discord_advanced_claimed: claim }), true)
    assert.equal(hasNflAccess('user', false, ultimate), true)
  }
})

test('admin, explicit beta and NFL grants remain independent of the claim', () => {
  assert.equal(hasFullAccessOverride('admin', false), true)
  assert.equal(hasFullAccessOverride('user', true), true)
  assert.equal(hasFullAccessOverride('user', false), false)
  assert.equal(hasNbaAccess({ account_type: 'admin', tier: 'free', discord_advanced_claimed: false }), true)
  assert.equal(hasNbaAccess({ tier: 'free', admin_granted_tier: 'ultimate', discord_advanced_claimed: false }), true)
  assert.equal(hasNflAccess('user', true, 'free'), true)
})
