import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const artifactUrl = new URL('../src/data/biomechanics/openbiomechanics-hitting-priors.json', import.meta.url)
const priors = JSON.parse(await readFile(artifactUrl, 'utf8'))

test('OpenBiomechanics calibration artifact has traceable provenance', () => {
  assert.equal(priors.schemaVersion, 1)
  assert.match(priors.modelVersion, /^hr-mechanics-/)
  assert.match(priors.source.repository, /drivelineresearch\/openbiomechanics/)
  assert.match(priors.source.revision, /^[a-f0-9]{40}$/)
  assert.match(priors.source.importantLimit, /never imputed/i)
})

test('calibration samples and grouped-athlete validation are production-usable', () => {
  assert.ok(priors.samples.transferRows >= 600)
  assert.ok(priors.samples.distanceRows >= 500)
  assert.ok(priors.models.exitVelocityTransfer.groupedAthleteCv.mae < 6)
  assert.ok(priors.models.carryDistance.groupedAthleteCv.mae < 30)
  assert.ok(priors.models.carryDistance.groupedAthleteCv.r2 > 0.85)
})

test('runtime calibration uses only observables available in SlipSurge MLB tracking', () => {
  assert.deepEqual(
    priors.models.exitVelocityTransfer.features,
    ['batSpeed', 'attackAngle', 'attackAngleSquared'],
  )
  assert.deepEqual(
    priors.models.carryDistance.features,
    ['exitVelocity', 'launchAngle', 'launchAngleSquared', 'exitVelocityLaunchAngle'],
  )
  const runtimeFeatures = [
    ...priors.models.exitVelocityTransfer.features,
    ...priors.models.carryDistance.features,
  ].join(' ')
  assert.doesNotMatch(runtimeFeatures, /pelvis|torso|wrist|cog|joint/i)
})

test('all fitted coefficients are finite', () => {
  for (const model of Object.values(priors.models)) {
    assert.ok(Number.isFinite(model.intercept))
    for (const coefficient of Object.values(model.coefficients)) {
      assert.ok(Number.isFinite(coefficient))
    }
  }
})
