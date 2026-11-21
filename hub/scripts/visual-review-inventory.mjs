import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const target='src/app/design-review/visual-audit/inventory.json'
const old=fs.existsSync(target)?new Map(JSON.parse(fs.readFileSync(target,'utf8')).map(row=>[row.id,row])):new Map()
const files=execFileSync('rg',['--files','src/app'],{encoding:'utf8'}).trim().split(/\r?\n/).map(file=>file.replaceAll('\\','/')).filter(file=>file.endsWith('/page.tsx')&&!file.startsWith('src/app/design-review/')).sort()
const title=value=>value.replace(/\[([^\]]+)\]/g,'$1').replaceAll('-',' ').replace(/\b\w/g,s=>s.toUpperCase())
const group=route=>route.startsWith('/admin')?'Admin':route.startsWith('/settings')?'Settings':route.startsWith('/auth')||route==='/onboarding'?'Account access':/^\/(the-paint|nba)(\/|$)/.test(route)?'NBA':/^\/(the-sideline|nfl)(\/|$)/.test(route)?'NFL':/^\/(dugout|players|mlb|weather-lab|pitcher-report|slate-breakdown|batter-cost|odds-terminal|synergy|daily-recap|spray-charts|the-public)(\/|$)/.test(route)?'MLB · off-season':/^\/(creators|marketplace|pricing|pro)(\/|$)/.test(route)?'Creators & commerce':/^\/(feed|explore|profile|posts|picks|messages|community|channels|groups|forum|blog|pages|events|bookmarks|notifications|search|hashtag|stories)(\/|$)/.test(route)?'Community':'General'
const ledger=JSON.parse(fs.readFileSync('src/app/design-review/visual-audit/release-ledger.json','utf8'))
const published=new Set(ledger.items)
const releaseStatus=row=>['In progress','Queued'].includes(row.status)?row.status:row.release?.state==='Live'?'Live':['Review ready','Approved'].includes(row.status)?'Ready to deploy':row.status
const checks={desktopDark:false,desktopLight:false,phoneDark:false,phoneLight:false,keyboard:false,motion:false,states:false,toolAccess:false}
const rows=[]
function add(item){rows.push({...item,status:'Queued',batch:null,notes:'',checks:{...checks},evidence:[],...old.get(item.id),release:old.get(item.id)?.release??(published.has(item.id)?ledger.production:null)})}
for(const file of files){const route='/'+file.slice('src/app/'.length,-'/page.tsx'.length).split('/').filter(p=>!p.startsWith('(')).join('/');add({id:'route:'+route,route,source:file,label:route==='/'?'Home':title(route.slice(1).replaceAll('/',' · ')),group:group(route),kind:'Page'})}
const nba=[['research','The Court'],['odds-board','Odds Board'],['odds','Odds comparison'],['ladders','Ladders'],['movement','Market Story'],['first-basket','First basket'],['cheatsheets','Cheatsheets'],['score','SlipSurge Score'],['slate','Slate Edge'],['public','ThePublic'],['divergence','Cross-market'],['dvp','Defense × position'],['usage','Player trends'],['tracking','Game tracking'],['matchup','Matchup Lab'],['availability','Availability'],['game-markets','Game markets']]
for(const [view,label] of nba)add({id:'nba:'+view,route:'/the-paint?view='+view,label:'NBA · '+label,group:'NBA',kind:'Workspace'})
add({id:'nba-surface:Game markets and public activity',route:'/the-paint',label:'NBA · Game market slider and public activity',group:'NBA',kind:'Panel'})
for(const [query,label] of [['','The Sideline'],['view=odds-board','Odds Board'],['mode=cheatsheets','Cheatsheets'],['mode=public','The Public'],['mode=markets','Sportsbooks'],['mode=research','Matchup Lab']])add({id:'nfl:'+(query||'research'),route:'/the-sideline'+(query?'?'+query:''),label:'NFL · '+label,group:'NFL',kind:'Workspace'})
for(const label of ['Overview','Game tracking','Ladders','Market Story','Shots','All odds'])add({id:'nba-drawer:'+label,route:'/the-paint',label:'Player drawer · '+label,group:'NBA',kind:'Panel'})
for(const label of ['Market Edge','Exact-Line Hits','Explosive Plays','Run Gaps','Defense / DvP'])add({id:'nfl-cheatsheet:'+label,route:'/the-sideline?mode=cheatsheets',label:'Cheatsheets · '+label,group:'NFL',kind:'Panel'})
for(const [view,label] of [['core','Game Day'],['touchdowns','TDs'],['props','Props'],['usage','Usage'],['tracking','Tracking'],['team','Team'],['all','All'],['custom','Custom']])add({id:'nfl-board:'+view,route:'/the-sideline?view='+view,label:'Sideline board · '+label,group:'NFL',kind:'Panel'})
for(const label of ['Matchup','NFL Tracking','Sportsbooks'])add({id:'nfl-drawer:'+label,route:'/the-sideline',label:'NFL player drawer · '+label,group:'NFL',kind:'Panel'})
for(const label of ['Role command','Score zone','Receiving value','Route leverage','Ground game','QB command','Explosive lanes','Market signal'])add({id:'nfl-matchup:'+label,route:'/the-sideline?mode=research',label:'Matchup Lab · '+label,group:'NFL',kind:'Panel'})
for(const label of ['Slate Rankings','Matchup Lens','Model vs Market','Signal Lab'])add({id:'nfl-edge:'+label,route:'/the-sideline',label:'Sideline Edge · '+label,group:'NFL',kind:'Panel'})
for(const label of ['Touchdown tracker','Matrix library','Matrix community','Matrix editor','Column manager','Player comparison','Game lines and capture replay'])add({id:'nfl-tool:'+label,route:'/the-sideline',label:'NFL · '+label,group:'NFL',kind:'Panel'})
add({id:'shared:NBA score calculation drawer',route:'/the-paint?view=score',label:'NBA score calculation drawer',group:'Shared components',kind:'Shared surface'})
add({id:'shared:NBA game-specific lineups',route:'/the-paint?view=game-markets',label:'NBA game-specific lineup cards',group:'Shared components',kind:'Shared surface'})
add({id:'shared:Saved sportsbook picker',route:'/the-paint?view=odds',label:'Saved sportsbook picker and comparison links',group:'Shared components',kind:'Shared surface'})
add({id:'shared:VOLT and Sparks teaser',route:null,source:'src/components/volt/VoltTeaser.tsx',label:'VOLT and Sparks teaser',group:'Shared components',kind:'Shared surface'})
for(const label of ['Member identity, avatar rings and badges','Account menu','Global search','Notifications panel','What’s new and release popup','Saved picks drawer','NBA Matrix','NFL Matrix','Player comparison','Post composer','Comments and share','Image and video viewer','Confirmation dialogs','Empty, loading and error states'])add({id:'shared:'+label,route:label.startsWith('Member identity')?'/design-review/identity':null,label,group:'Shared components',kind:'Shared surface'})
fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(rows,null,2)+'\n')
const totals=Object.fromEntries([...new Set(rows.map(r=>r.group))].map(g=>[g,rows.filter(r=>r.group===g).length]))
fs.writeFileSync('docs/design/page-by-page-checklist.txt','SlipSurge page-by-page visual review\n\nEvery item requires its own review. A shared CSS change does not certify its consumers.\nChecks: desktop dark/light; phone dark/light; keyboard; reduced motion; loading/empty/error; all tools reachable.\nCompleted changes are Live in production. Owner visual feedback does not block the authorized rollout. Queued means unfinished overhaul work, not an unavailable tool.\nMLB remains hidden/off-season; its pages stay in the inventory.\n\n'+rows.map(r=>`[${releaseStatus(r)}] ${r.group} | ${r.label} | ${r.route??'Shared surface'}`).join('\n')+'\n')
console.log(JSON.stringify({pages:files.length,total:rows.length,groups:totals}))
