import test from 'node:test'
import assert from 'node:assert/strict'
import { researchHome, researchSportForPath, researchToolActive, researchToolHref } from '../src/components/layout/researchNavigation'

test('sport detection does not confuse social pages or similarly named URLs', () => {
  assert.equal(researchSportForPath('/the-sideline'), 'nfl')
  assert.equal(researchSportForPath('/daily-recap'), 'mlb')
  assert.equal(researchSportForPath('/workspace'), null)
  assert.equal(researchSportForPath('/the-sideline-other'), null)
})
test('NFL preference never grants NFL access', () => {
  assert.equal(researchHome('nfl', false), '/dugout')
  assert.equal(researchHome('nfl', true), '/the-sideline')
})
test('tool navigation preserves game, date, sample and capture but replaces mode', () => {
  const current = new URLSearchParams('game=2026_03_ATL_GB&date=2026-09-24&sample=regular&at=2026-09-24T18:00:00Z&mode=public&other=private')
  const href = researchToolHref('/the-sideline?mode=cheatsheets', '/the-sideline', current)
  const result = new URL(href, 'https://www.slipsurge.com')
  assert.equal(result.searchParams.get('game'), current.get('game'))
  assert.equal(result.searchParams.get('sample'), 'regular')
  assert.equal(result.searchParams.get('at'), current.get('at'))
  assert.equal(result.searchParams.get('mode'), 'cheatsheets')
  assert.equal(result.searchParams.has('other'), false)
  assert.equal(new URL(researchToolHref('/the-sideline', '/the-sideline', current), result).searchParams.has('mode'), false)
  assert.equal(researchToolHref('/dugout', '/the-sideline', current), '/dugout')
  assert.equal(researchToolHref('/the-sideline', '/feed', current), '/the-sideline')
})
test('exactly one NFL tool is active for each mode', () => {
  const modes = ['', 'cheatsheets', 'public', 'markets', 'research']
  for (const mode of modes) {
    const search = new URLSearchParams({mode})
    const active = modes.filter(value => researchToolActive('/the-sideline' + (value ? '?mode=' + value : ''), '/the-sideline', search))
    assert.deepEqual(active, [mode])
  }
})
