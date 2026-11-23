import fs from 'node:fs/promises'
import path from 'node:path'

const evidenceRoot = process.argv[2]
if (!evidenceRoot) throw new Error('Pass the browser review evidence directory.')
const batch = 'mobile-complete-2026-11-23'
const productionReceipt = await fs.readFile('docs/design/mobile-complete-production-2026-11-23.json','utf8').then(JSON.parse).catch(error=>{if(error.code==='ENOENT')return null;throw error})
const published = productionReceipt?.production?.state === 'READY'
const inventoryPath = 'src/app/design-review/visual-audit/inventory.json'
const read = async name => JSON.parse(await fs.readFile(path.join(evidenceRoot, `${name}.json`), 'utf8'))
const inventory = JSON.parse(await fs.readFile(inventoryPath, 'utf8'))
const [baseline, narrow, flows] = await Promise.all(['baseline','narrow','flows'].map(read))
const latest = rows => new Map(rows.map(row => [row.id, row]))
const baseMap = latest(baseline), narrowMap = latest(narrow)
const superseded={
  'nba-game-tracking-chart-before-touch-slider':'release-player-chart-scrubber-320-dark',
  'community-chat-send-320-light':'community-chat-sent-and-cleared-320-light',
  'release-community-chat-short-320-dark':'shipping-short-chat-composer-clearance',
  'final-short-community-chat-320-dark':'shipping-short-chat-composer-clearance',
  'global-search-results-390-light':'release-search-suggestions-320-light',
  'explore-final-320-light':'release-explore-320-light',
  'nfl-public-research':'nfl-public-view-loaded-390-light',
  'nfl-sportsbooks-research':'nfl-sportsbook-comparison-loaded-390-light',
  'free-community-onboarding-390-light':'shipping-community-channels-dialog-390-light',
}
const currentFlow=flow=>flow.valid!==false&&!flow.loading?.length&&!superseded[flow.case]
const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const failed = result => result.overflow || result.error === true || result.routeError === true || result.errors?.length > 0 || result.loading === true || Array.isArray(result.loading) && result.loading.length > 0
const pages = inventory.filter(row => row.kind === 'Page')
for (const row of pages) {
  for (const [name, map, count] of [['standard',baseMap,4],['narrow',narrowMap,6]]) {
    const receipt = map.get(row.id)
    if (!receipt || Object.keys(receipt.layouts).length !== count) throw new Error(`${row.id}: missing ${name} layouts`)
    for (const [view,result] of Object.entries(receipt.layouts)) if (failed(result)) throw new Error(`${row.id}: unresolved ${view}`)
  }
}

const shared = {
  'NBA score calculation drawer':['nba-score-breakdown'],
  'NBA game-specific lineups':['nba-game-markets-and-lineup'],
  'Saved sportsbook picker':['player-book-selection','research-preferences','saved-launch-page'],
  'VOLT and Sparks teaser':['volt-coming-soon-touch'],
  'Member identity, avatar rings and badges':['member-badges','profile-avatar','member-profile'],
  'Account menu':['account-theme'],
  'Global search':['global-search','release-search'],
  'Notifications panel':['notifications-','notification-targets'],
  'What’s new and release popup':['whats-new'],
  'Saved picks drawer':['my-picks-drawer','my-picks-history','watchlist'],
  'NBA Matrix':['nba-matrix'],
  'NFL Matrix':['nfl-matrix'],
  'Player comparison':['nba-two-player-comparison','nfl-player-comparison'],
  'Post composer':['creator-composer','parlay-composer','creator-content'],
  'Comments and share':['comment-','nested-comment','share-copy','pick-share'],
  'Image and video viewer':['story-image-viewer','story-video-playback'],
  'Confirmation dialogs':['watchlist-clear-confirmation'],
  'Empty, loading and error states':['empty','private-boundary','blocked-preserves-draft','gif-draft'],
}
const tools = {
  'Touchdown tracker':['nfl-touchdown'], 'Matrix library':['nfl-matrix-library'],
  'Matrix community':['nfl-matrix-community'], 'Matrix editor':['nfl-matrix-editor','nfl-matrix-pipeline'],
  'Column manager':['nfl-column'], 'Player comparison':['nfl-player-comparison'],
  'Game lines and capture replay':['nfl-game-lines-and-replay'],
}
function routeMatches(route, url) {
  const target = new URL(url, 'http://review.invalid')
  const expected = new URL(route, 'http://review.invalid')
  const pattern = expected.pathname.split('/').map(part => part.startsWith('[') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/')
  if (!new RegExp(`^${pattern}$`).test(target.pathname)) return false
  return [...expected.searchParams].every(([key,value]) => target.searchParams.get(key) === value)
}
function related(row, flow) {
  const name = slug(flow.case), label = row.id.slice(row.id.indexOf(':')+1)
  if (row.kind === 'Page' || row.kind === 'Workspace') return row.route && routeMatches(row.route,flow.url)
  if (row.id.startsWith('shared:')) return shared[label]?.some(term => name.includes(slug(term)))
  if (row.id.startsWith('nfl-tool:')) return tools[label]?.some(term => name.includes(slug(term)))
  if (row.id.startsWith('nfl-board:')) return name.includes('nfl-board-'+(label==='core'?'game-day':slug(label))) || label==='core'&&name.includes('nfl-board-core')
  if (row.id.startsWith('nfl-drawer:')) return name.includes('nfl-drawer-'+slug(label)) || name.includes('nfl-player-drawer-'+slug(label))
  if (row.id.startsWith('nfl-edge:')) return name.includes('nfl-edge-'+slug(label)) || label==='Slate Rankings'&&name.includes('nfl-slate-rankings')
  if (row.id.startsWith('nfl-cheatsheet:')) return name.includes('nfl-cheatsheet-'+slug(label))
  if (row.id.startsWith('nfl-matchup:')) return name.includes('nfl-matchup-'+slug(label))
  if (row.id.startsWith('nba-drawer:')) return name.includes('nba-drawer-'+slug(label)) || label==='Game tracking'&&name.includes('chart-scrubber')
  return row.id.startsWith('nba-surface:') && name.includes('nba-game-markets-and-lineup')
}
const items = inventory.map(row => {
  const receipts = [baseMap.get(row.id),narrowMap.get(row.id)].filter(Boolean)
  const interactions = flows.filter(flow => currentFlow(flow) && related(row,flow))
  const limitations = []
  if (row.group === 'Admin') limitations.push('Administrative layout and guarded states reviewed. Collectors, job replays, grants, deletion and financial operations were not executed.')
  if (row.group.includes('off-season')) limitations.push('Existing off-season/unavailable state only; seasonal data and hidden features were not enabled.')
  if (row.group === 'Creators & commerce') limitations.push('Checkout, wallet and membership UI use isolated fixtures. No real charge, withdrawal, KYC or external role grant was performed.')
  if (row.group === 'Account access') limitations.push('Local account/access UI only; external OAuth, real credentials and real account creation were not performed.')
  if (row.id.includes('Game lines and capture replay')) limitations.push('Single-capture fixture verifies the honest disabled replay state; it does not certify provider capture history.')
  const methods = [...(receipts.length?['Rendered layout measurement']:[]),...(interactions.length?['Interaction or state receipt']:[])]
  return {id:row.id,label:row.label,group:row.group,kind:row.kind,methods,layouts:Object.assign({},...receipts.map(value=>value.layouts)),interactionCases:interactions.map(flow=>flow.case),limitations}
})
const missing=items.filter(item=>!item.methods.length).map(item=>item.id)
if(missing.length)throw new Error(`No fresh evidence for: ${missing.join(', ')}`)
const flowReceipts = flows.map(flow => ({case:flow.case,at:flow.at,url:flow.url,width:flow.width,height:flow.height,theme:flow.theme,overflow:flow.overflow,loading:flow.loading,errors:flow.errors,dialogs:flow.dialogs,sendClearance:flow.sendClearance,valid:flow.valid,reason:flow.reason,supersededBy:superseded[flow.case],assessment:superseded[flow.case]?'Earlier observation, superseded by the named final check':flow.loading?.length?'Loading-state observation; not a completed interaction':flow.errors?.some(value=>/disabled in private design review/.test(value))?'Expected private mutation boundary; draft/error handling observed':'Rendered state observation'}))
const report = {
  batch,phase:published?'Published; live browser checks are recorded in mobile-complete-production-2026-11-23.json':'Prepared for authorized publication; production receipt is recorded separately',reviewedAt:new Date().toISOString(),
  production:productionReceipt?.production,
  scope:{catalogItems:inventory.length,productRoutes:pages.length,standardRouteLayouts:pages.length*4,narrowRouteLayouts:pages.length*6,interactionObservations:flows.filter(currentFlow).length},
  environment:'Actual application components in the Codex in-app browser, isolated local data and blocked external service calls',
  viewports:['1440×1000','390×844','320×740','820×1024','844×390','320×480','320×390'],
  limitations:['Viewport QA is not physical-device or native-keyboard certification.','Layout receipts and individual flow receipts are listed separately. A route render does not certify every operation on that route.','Provider financial operations, external OAuth and production job/replay actions were not exercised.','Legacy MLB stays hidden/off-season. Existing publication records and ten owner approvals are preserved.'],
  fixes:['Explore: height-only lazy-card reservation, shrinkable grid children and wrapping tool links.','Community chat: viewport-sized conversation, explicit-entry alignment, single-channel duplication removed, short-screen content minimum and composer clearance.','Phone controls: 44px main, dialog, navigation, account, search, notification, creator, forum and workspace actions.','Settings: local navigation collapses by available content width; team selection reflows by container width.','Creator and shared legacy dialogs: visible-viewport sizing, 16px fields and 44px wizard/payout actions.','Charts: 44px native observation scrubber, missing-value handling and accessible readouts.','Sharing: HTTP failures cannot download an error body as a PNG; clipboard fallback and native-share errors have clear feedback.','Member identity: badge overlays verified and floating VOLT hidden behind dialogs and active phone conversations; small floating mascot retained elsewhere.','Search save action has an accessible name; creator promotion avoids a duplicate heading.','Review inventory includes launch, saved research preferences and creator checkout-return pages with a valid fixture offer.'],
  items,flowReceipts,
}
await fs.writeFile(`docs/design/${batch}.json`,JSON.stringify(report,null,2)+'\n')
const overview = `SlipSurge complete mobile review · 23 November 2026\n\nPrepared for the authorized release. Production verification is recorded separately.\n\nCoverage: ${pages.length} product routes, ${inventory.length-pages.length} workspaces/panels/shared surfaces, ${pages.length*10} route layout measurements and ${report.scope.interactionObservations} recorded interaction/state observations.\nWidths include 320, 390, 820, 844 and 1440 pixels, with light/dark and short-height checks.\n\n${report.fixes.map(text=>'- '+text).join('\n')}\n\nVerification boundaries\n${report.limitations.map(text=>'- '+text).join('\n')}\n\nIndividual checklist\n${items.map(item=>`[Reviewed] ${item.group} | ${item.label} | ${Object.keys(item.layouts).length} own layout receipts | ${item.interactionCases.length} associated interaction/state receipts${item.limitations.length?' | '+item.limitations.join(' '):''}`).join('\n')}\n\nDetailed measurements and interaction IDs: ${batch}.json\n`
await fs.writeFile(`docs/design/${batch}.txt`,published?overview.replace('Prepared for the authorized release. Production verification is recorded separately.','Published on www.slipsurge.com. The live deployment, 67 settled browser checks and verification limits are recorded in mobile-complete-production-2026-11-23.json.'):overview)
for (const row of inventory) {
  const item = items.find(item=>item.id===row.id)
  row.mobileReview={date:'2026-11-23',batch,methods:item.methods,layoutReceipts:Object.keys(item.layouts).length,interactionReceipts:item.interactionCases.length,limitations:item.limitations}
  const reference=`docs/design/${batch}.json#${row.id}`
  row.evidence=[...new Set([...row.evidence,reference])]
}
await fs.writeFile(inventoryPath,JSON.stringify(inventory,null,2)+'\n')
const checklistPath='docs/design/page-by-page-checklist.txt'
let checklist=await fs.readFile(checklistPath,'utf8')
const note=`Expanded full-scope mobile review, 23 November 2026: ${pages.length} product routes and ${inventory.length-pages.length} workspaces/panels/shared surfaces. Route layouts and actual interaction/state observations are recorded separately in ${batch}.txt/json, including provider, admin, off-season and physical-device limits. Existing release records below describe their original published batches.\n\n`
if(!checklist.includes('Expanded full-scope mobile review, 23 November 2026:'))checklist=checklist.replace(/^SlipSurge page-by-page visual review\r?\n\r?\n/,'SlipSurge page-by-page visual review\n\n'+note)
await fs.writeFile(checklistPath,checklist)
console.log(JSON.stringify(report.scope))
