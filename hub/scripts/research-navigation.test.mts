import test from 'node:test'
import assert from 'node:assert/strict'
import { availableResearchSports, resolveResearchSport, researchHome, researchSportForPath, researchToolActive, researchToolHref, researchNavigationHref, NBA_UPGRADE_HREF } from '../src/components/layout/researchNavigation'
import { hasNbaAccess, isNbaToolHref } from '../src/lib/nbaAccessPolicy'
import { nbaResearchNavigation, primaryNavigation, routeMatches } from '../src/components/layout/navigationConfig'

test('sport detection does not confuse social pages or similarly named URLs', () => {
  assert.equal(researchSportForPath('/the-sideline'), 'nfl')
  assert.equal(researchSportForPath('/nfl/players/test'), 'nfl')
  assert.equal(researchSportForPath('/nfl/teams/BAL'), 'nfl')
  assert.equal(researchSportForPath('/mlb/teams/147'), 'mlb')
  assert.equal(researchSportForPath('/players/592450'), 'mlb')
  assert.equal(researchSportForPath('/daily-recap'), 'mlb')
  assert.equal(researchSportForPath('/workspace'), null)
  assert.equal(researchSportForPath('/sports'), null)
  assert.equal(researchSportForPath('/sports/nba/123'), 'nba')
  assert.equal(researchSportForPath('/sports/nfl/123'), 'nfl')
  assert.equal(researchSportForPath('/sports/mlb/123'), 'mlb')
  assert.equal(researchSportForPath('/the-sideline-other'), null)
  assert.equal(researchSportForPath('/nfl-news'), null)
  assert.equal(researchSportForPath('/players-other'), null)
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

test('NBA discovery is public but stored preference never grants Ultimate tool access', () => {
  for (const profile of [undefined, null, {}, { account_type: 'user', tier: 'advanced' }, { account_type: 'beta', tier: 'free' }, { account_type: 'ultimate' }, { account_type: 'Admin' }]) {
    const nbaAccess = hasNbaAccess(profile)
    assert.equal(nbaAccess, false)
    assert.deepEqual(availableResearchSports(true), ['mlb', 'nfl', 'nba'])
    assert.equal(resolveResearchSport('nba', true), 'nba')
    assert.equal(researchHome('nba', true, nbaAccess), NBA_UPGRADE_HREF)
    assert.equal(researchNavigationHref('/the-paint?view=score', '/the-paint', new URLSearchParams('game=123'), nbaAccess), NBA_UPGRADE_HREF)
  }
  for (const profile of [{ account_type: 'admin' }, { account_type: 'user', tier: 'ultimate' }, { account_type: 'user', tier: 'free', admin_granted_tier: 'ultimate' }]) {
    assert.equal(hasNbaAccess(profile), true)
    assert.equal(researchHome('nba', false, hasNbaAccess(profile)), '/the-paint')
    assert.equal(researchNavigationHref('/the-paint?view=score', '/the-paint', new URLSearchParams('game=123'), hasNbaAccess(profile)), '/the-paint?view=score&game=123')
  }
  assert.deepEqual(availableResearchSports(false), ['mlb','nba'])
})

test('NBA page families are recognized without matching similarly named public paths', () => {
  for (const path of ['/the-paint', '/the-paint?view=public', '/the-paint/history', '/nba/players/434', '/nba/teams/2']) {
    assert.equal(isNbaToolHref(path), true)
    assert.equal(researchSportForPath(path), 'nba')
  }
  for (const path of ['/the-painter','/nba-other','/nbanews','/feed','/nfl/players/test']) assert.equal(isNbaToolHref(path), false)
  const research = primaryNavigation.find(item => item.label === 'Research')!
  assert.equal(routeMatches('/nba/players/434', research), true)
  assert.equal(routeMatches('/the-paint', research), true)
})

test('NBA tool links preserve selected matchup, market and book without carrying a stale player or panel', () => {
  const current = new URLSearchParams('game=21717855&date=2026-10-20&market=assists&book=fanduel&side=under&view=score&player=434&panel=ladder&line=5.5&type=over_under&fixture=private')
  const result = new URL(researchToolHref('/the-paint?view=public', '/the-paint', current), 'https://www.slipsurge.com')
  for (const key of ['game','date','market','book','side']) assert.equal(result.searchParams.get(key), current.get(key))
  assert.equal(result.searchParams.get('view'), 'public')
  for (const key of ['player','panel','line','type','fixture']) assert.equal(result.searchParams.has(key), false)
  assert.equal(researchToolHref('/the-sideline?mode=public','/the-paint',current),'/the-sideline?mode=public')
  assert.equal(researchToolHref('/the-paint?view=public','/the-sideline',current),'/the-paint?view=public')
  assert.equal(new URL(researchToolHref('/the-paint?view=score&market=points','/the-paint',current),result).searchParams.get('market'),'points')
})

test('every NBA workspace selects exactly its own global navigation item', () => {
  assert.equal(new Set(nbaResearchNavigation.map(item=>item.href)).size,nbaResearchNavigation.length)
  assert.deepEqual(nbaResearchNavigation.map(item=>item.href), [
    '/the-paint', ...['odds','ladders','movement','first-basket','cheatsheets','score','slate','public','divergence','dvp','usage','tracking','matchup','availability','game-markets'].map(view=>`/the-paint?view=${view}`),
  ])
  assert.ok(nbaResearchNavigation.every(item=>item.ultimateOnly))
  for (const item of nbaResearchNavigation) {
    const search = new URLSearchParams(item.href.split('?')[1] ?? '')
    assert.deepEqual(nbaResearchNavigation.filter(candidate=>researchToolActive(candidate.href,'/the-paint',search)).map(candidate=>candidate.href),[item.href])
  }
  for (const view of ['research','models','invalid']) {
    assert.deepEqual(nbaResearchNavigation.filter(item=>researchToolActive(item.href,'/the-paint',new URLSearchParams({view}))).map(item=>item.href),['/the-paint'])
  }
})
