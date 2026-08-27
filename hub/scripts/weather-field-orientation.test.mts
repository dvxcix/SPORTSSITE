import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MLB_PARKS,
  hrWindColor,
  windFieldLabel,
  windRelativeToField,
  windTowardBearing,
} from '../packages/core/src/mlbParks.ts'

test('meteorological FROM bearings convert to travel bearings', () => {
  assert.equal(windTowardBearing(0), 180)
  assert.equal(windTowardBearing(180), 0)
  assert.equal(windTowardBearing(270), 90)
})

test('wind is rotated into the real home-plate-to-center-field bearing', () => {
  assert.equal(windRelativeToField(180, 0), 0)
  assert.equal(windRelativeToField(0, 0), 180)
  assert.equal(windRelativeToField(270, 90), 0)
  assert.equal(windRelativeToField(90, 90), 180)
})

test('field labels describe baseball direction rather than raw compass direction', () => {
  assert.equal(windFieldLabel(180, 0), 'OUT TO CF')
  assert.equal(windFieldLabel(0, 0), 'IN FROM CF')
  assert.equal(windFieldLabel(225, 0), 'OUT TO RF')
  assert.equal(windFieldLabel(135, 0), 'OUT TO LF')
})

test('equally aligned wind receives the same HR-carry color at rotated parks', () => {
  assert.equal(hrWindColor(180, 15, 0), hrWindColor(270, 15, 90))
  assert.equal(hrWindColor(0, 15, 0), hrWindColor(90, 15, 90))
})

test('all static outage fallbacks have a valid MLB venue azimuth', () => {
  for (const [team, park] of Object.entries(MLB_PARKS)) {
    assert.ok(Number.isFinite(park.orientationDeg), `${team} orientation must be finite`)
    assert.ok(park.orientationDeg >= 0 && park.orientationDeg < 360, `${team} orientation must be normalized`)
  }
  assert.equal(MLB_PARKS.ATL.orientationDeg, 145)
  assert.equal(MLB_PARKS.CHC.orientationDeg, 37)
  assert.equal(MLB_PARKS.CWS.orientationDeg, 127)
  assert.equal(MLB_PARKS.HOU.orientationDeg, 343)
  assert.equal(MLB_PARKS.SF.orientationDeg, 85)
  assert.equal(MLB_PARKS.TOR.orientationDeg, 345)
})
