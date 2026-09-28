import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { NFL_SLATE_EDGE_MARKETS } from '../src/lib/nflSlateEdge'
import { nflWatchlistSelection } from '../src/lib/nflWatchlist'
const player = { id: 1, name: 'Test Receiver', team: 'ATL', position: 'WR', markets: [] }
const offer = { vendor: 'fanduel', line: 60, openingLine: 60, type: 'milestone' as const, current: { odds: 270 }, opening: { odds: 320 }, updatedAt: null }
const market = { key: 'receiving_yards:milestone:60', propType: 'receiving_yards', category: 'receiving' as const, label: 'Receiving Yards', line: 60, offers: [offer] }
const selection = nflWatchlistSelection(player, market, offer, 'over', { id: 'fixture', gameday: '2026-09-28' })
const entry = { id: 'bdl-1', gameId: 'fixture', gameLabel: 'ATL at GB', awayAbbr: 'ATL', homeAbbr: 'GB', awayLogo: null, homeLogo: null, team: 'ATL', teamLogo: null, name: player.name, position: 'WR', headshot: null, games: 2,
 score: Object.fromEntries(NFL_SLATE_EDGE_MARKETS.map(m=>[m.key,70])), mm: Object.fromEntries(NFL_SLATE_EDGE_MARKETS.map(m=>[m.key,4])),
 markets: Object.fromEntries(NFL_SLATE_EDGE_MARKETS.map(m=>[m.key,{ label: market.label, line:60,openingLine:60,odds:270,openingOdds:320,vendor:'fanduel',picks:200,bookGap:50,books:['fanduel'],selection }])), roleShare:25,redZone:60,breakaway:60,redZoneLooks:3,dvp:{receiving_yards:10} }
const payload = { date:'2026-09-28',sampleLabel:'2026 Season',games:[{id:'fixture',label:'ATL at GB',awayAbbr:'ATL',homeAbbr:'GB',awayLogo:null,homeLogo:null}],entries:[entry] }
const browser = await chromium.launch()
try {
 for (const width of [390,768,1280]) {
  const page = await browser.newPage({viewport:{width,height:900}})
  const errors:string[]=[]
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)})
  await page.route(/\/api\/the-sideline\/slate-edge/,r=>r.fulfill({json:payload}))
  await page.goto('http://127.0.0.1:4199/slate')
  await page.getByRole('button',{name:'Share / Workspace',exact:true}).click({timeout:10000}).catch(async e=>{console.log(await page.locator('body').innerText());throw e})
  const share=page.getByRole('dialog',{name:'Share what you saw'})
  await share.waitFor()
  await page.screenshot({path:`.artifacts/research-evidence-${width}.png`})
  await share.getByRole('button',{name:'Save read',exact:true}).click()
  await share.getByText('Saved to Research Workspace.').waitFor()
  const writes=await page.evaluate(()=>(window as any).fixtureWrites)
  assert.equal(writes[0].table,'research_workspace_items')
  assert.equal(writes[0].value.payload.sport,'NFL')
  assert.equal(writes[0].value.payload.nfl.entry.markets.anytime_td.odds,270)
  assert.match(writes[0].value.source_path,/^\/the-sideline\?date=2026-09-28&game=fixture/)
  await share.waitFor({state:'hidden'})
  await page.getByRole('button',{name:'Share / Workspace',exact:true}).click()
  await share.waitFor()
  await page.keyboard.press('Escape')
  await share.waitFor({state:'hidden'})
  assert.equal(await page.getByRole('dialog').count(),1)
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden')
  await page.getByRole('button',{name:'Save',exact:true}).click()
  await page.getByRole('button',{name:'Saved',exact:true}).waitFor()
  await page.getByRole('button',{name:'Post Pick',exact:true}).click()
  const watch=page.getByRole('dialog',{name:'★ My Watchlist'})
  await watch.waitFor()
  assert.equal(await watch.getByText('60+ Receiving Yards',{exact:true}).count(),1)
  let imageIds=''
  await page.route('**/api/share-image/watchlist?**',r=>{imageIds=new URL(r.request().url()).searchParams.get('ids')??'';return r.fulfill({status:503,body:'Image unavailable'})})
  await watch.getByRole('button',{name:/Share/}).click()
  await page.waitForFunction(()=>!!document.querySelector('[role="dialog"]'))
  await page.getByRole('button',{name:/Download/}).waitFor()
  assert.equal(imageIds,'11111111-1111-4111-8111-111111111111')
  await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'Close watchlist'}).click()
  await page.getByRole('button',{name:/My Picks/}).click()
  const picks=page.getByRole('dialog',{name:'My Picks',exact:true})
  await picks.getByText('Saved yesterday for Monday',{exact:true}).waitFor()
  assert.equal(await picks.getByText('Past settled pick',{exact:true}).count(),0)
  await picks.getByRole('button',{name:'History',exact:true}).click()
  await picks.getByText('Past settled pick',{exact:true}).waitFor()
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'')
  assert.deepEqual(errors,[])
  await page.screenshot({path:`.artifacts/research-flows-${width}.png`})
  console.log(`PASS ${width}: NFL evidence/workspace, nested Escape, exact save/post handoff, exact export IDs, next-day active pick, history, no JS errors`)
  await page.close()
 }
} finally { await browser.close() }
