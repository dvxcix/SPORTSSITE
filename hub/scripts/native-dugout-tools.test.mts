import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const fixture = { allowed: true, tier: 'ultimate', reads: [] as string[] }
Object.assign(globalThis, { nativeMlBToolsFixture: fixture })
const stubs: Record<string, string> = {
  '@/lib/supabase/nativeAccount': `export async function requireNativeAccount(request) {
    return request.headers.get('authorization') === 'Bearer fixture' ? {userId:'viewer',supabase:{}} :
      {error:Response.json({},{status:401})}
  }`,
  '@/lib/mlbViewerAccess': 'export async function canViewMlb() { return globalThis.nativeMlBToolsFixture.allowed }',
  '@/lib/requireTier': `export async function getEffectiveTier() {
    return {userId:'viewer',tier:globalThis.nativeMlBToolsFixture.tier}
  }`,
  '@/lib/weatherLab': `export async function getWeatherLabData(date) {
    globalThis.nativeMlBToolsFixture.reads.push('weather')
    return {date,fetchedAt:'2026-11-25T02:00:00Z',refreshSeconds:300,games:[{
      gamePk:111,gameDate:'2026-11-25T02:00:00Z',homeAbbr:'NYY',homeTeam:'New York Yankees',awayAbbr:'BOS',awayTeam:'Boston Red Sox',
      park:{name:'Yankee Stadium',city:'New York',orientationDeg:37},roofStatus:'closed',source:'Open-Meteo',
      hours:[{label:'9pm',tempF:69,windMph:21,windGustMph:23,windDirDeg:100,humidity:68,weatherCode:0}]
    }]}
  }`,
  '@/lib/dailyContactRecap': `export async function getDailyContactRecap(date) {
    globalThis.nativeMlBToolsFixture.reads.push('spray')
    const game={gamePk:111,venueName:'Yankee Stadium',status:'Final',awayTeam:'BOS',awayName:'Boston Red Sox',homeTeam:'NYY',homeName:'New York Yankees',parkTeamAbbr:'NYY'}
    return {date,generatedAt:'2026-11-25T02:00:00Z',games:[game],dataNotes:['Fixture'],contacts:[{
      id:'111:1',game,batterId:123,kind:'hit',hcX:137.2,hcY:67.4,coordinateSource:'statcast'
    }]}
  }`,
  '@/lib/parkHrHistory': `export async function loadParkHomeRunHistory(id) {
    globalThis.nativeMlBToolsFixture.reads.push('park:' + id)
    return {confirmed:true,season:2026,homeAbbr:'NYY',homeTeam:'New York Yankees',awayAbbr:'BOS',awayTeam:'Boston Red Sox',
      batters:[{mlbId:123,name:'Fixture',team:'NYY',career:4,season:2,position:'CF'}]}
  }`,
}
const source = await build({
  stdin: { contents: 'export * from "./src/app/api/mobile/dugout/tools/route"', resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'cjs', platform: 'node', tsconfig: 'tsconfig.json', external: ['next/server'],
  plugins: [{ name: 'native-mlb-tools', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'js' }))
  } }],
})
const route = { exports: {} as typeof import('../src/app/api/mobile/dugout/tools/route') }
new Function('require', 'module', 'exports', source.outputFiles[0].text)(createRequire(import.meta.url), route, route.exports)
const read = (query: string, signed = true) => route.exports.GET(new Request(`https://slipsurge.invalid/api/mobile/dugout/tools?${query}`,
  { headers: signed ? { authorization: 'Bearer fixture' } : {} }))

test('native weather and contact tools preserve MLB availability and per-tool tier floors', async () => {
  assert.equal((await read('tool=weather&date=2026-11-25', false)).status, 401)
  fixture.allowed = false
  assert.equal((await read('tool=weather&date=2026-11-25')).status, 403)
  fixture.allowed = true
  fixture.tier = 'basic'
  assert.equal((await read('tool=spray&date=2026-11-25')).status, 403)
  assert.equal((await read('tool=weather&date=2026-02-31')).status, 400)
  assert.equal((await read('tool=park-hr&gamePk=x')).status, 400)
  assert.deepEqual(fixture.reads, [])
  const weather = await read('tool=weather&date=2026-11-25')
  assert.equal(weather.status, 200)
  assert.equal(weather.headers.get('cache-control'), 'private, no-store')
  const { games: [game] } = await weather.json()
  assert.match(game.shape.outfield, /^M/)
  assert.equal(game.hours[0].windAngle, null)
  assert.equal(game.hours[0].carry.score, 0)
  assert.equal(game.hours[0].tempF, 69)
  fixture.tier = 'ultimate'
})

test('the native spray chart keeps recorded coordinates, park shapes and player artwork', async () => {
  const response = await read('tool=spray&date=2026-11-25')
  assert.equal(response.status, 200)
  const { games: [game], contacts: [event] } = await response.json()
  assert.equal(game.home.code, 'NYY')
  assert.match(game.shape.outfield, /^M/)
  assert.equal(event.hcX, 137.2)
  assert.equal(event.hcY, 67.4)
  assert.equal(event.coordinateSource, 'statcast')
  assert.match(event.headshot, /123\/headshot/)
  assert.equal(event.game, undefined)
  const homeRuns = await read('tool=park-hr&gamePk=111')
  assert.equal(homeRuns.status, 200)
  assert.equal((await homeRuns.json()).batters[0].career, 4)
})
