import fs from 'node:fs/promises'
import path from 'node:path'
const root=path.resolve(import.meta.dirname,'..'),app=path.join(root,'src/app'),entries=[]
const label=value=>value.replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase())
const replacements={username:'jordan-review',slug:'slate-notes',category:'nba',id:'00000000-0000-4000-8000-000000000101',tag:'NBA',sport:'nba',gameId:'900001',abbr:'KC',productId:'review-offer'}
async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){if(e.name==='api')continue;const file=path.join(dir,e.name);if(e.isDirectory())await walk(file);else if(e.name==='page.tsx'){
 let href='/'+path.relative(app,dir).replaceAll('\\','/').replace(/\([^/]+\)\/?/g,'').replace(/\[([^\]]+)\]/g,(_,name)=>replacements[name]??'review')
 if(href.startsWith('/groups/'))href=href.replace('/slate-notes','/nba-lounge')
 if(href.startsWith('/channels/'))href=href.replace('/slate-notes','/nba')
 if(href.startsWith('/blog/'))href=href.replace('/slate-notes','/a-better-workspace')
 if(href.startsWith('/blog/edit/'))href=href.replace('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000801')
 if(href.startsWith('/events/'))href=href.replace('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000901')
 if(href.startsWith('/forum/thread/'))href=href.replace('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000711')
 if(href.startsWith('/nba/players/'))href=href.replace('00000000-0000-4000-8000-000000000101','900110')
 if(href.startsWith('/nba/teams/'))href=href.replace('00000000-0000-4000-8000-000000000101','2')
 if(href.startsWith('/nfl/players/'))href=href.replace('00000000-0000-4000-8000-000000000101','review-nfl-0')
 const top=href.split('/')[1]
 const group=top==='admin'?'Administration':top==='auth'||top==='onboarding'?'Account entry':['the-paint','nba'].includes(top)?'NBA':['the-sideline','nfl'].includes(top)?'NFL':top==='settings'?'Account & preferences':['feed','community','groups','pages','channels','forum','messages','profile','notifications','bookmarks','events','stories','hashtag','posts'].includes(top)?'Community':['creators','marketplace'].includes(top)?'Creators & marketplace':['mlb','dugout','batter-cost','pitcher-report','spray-charts','slate-breakdown','players','weather-lab','synergy'].includes(top)?'Seasonal tools (hidden from members)':'Platform'
 entries.push({name:href==='/'?'Welcome':href.split('/').filter(Boolean).map(label).join(' / '),href,group,source:path.relative(root,file).replaceAll('\\','/')})
 }}}
await walk(app)
for(const [view,name]of Object.entries({research:'Research board',odds:'Player odds',ladders:'Ladder lab',movement:'Market movement','first-basket':'First basket',cheatsheets:'Cheatsheets',score:'SlipSurge Score',slate:'Slate edge',public:'The Public',divergence:'Market divergence',dvp:'Defense vs position',usage:'Usage',tracking:'Tracking',matchup:'Matchup lab',availability:'Availability','game-markets':'Game markets','odds-board':'Full odds board'}))entries.push({name,href:'/the-paint?view='+view,group:'NBA · tool views',source:'src/app/the-paint/PaintBoardClient.tsx'})
for(const mode of ['cheatsheets','public','markets','research'])entries.push({name:label(mode),href:'/the-sideline?mode='+mode,group:'NFL · tool views',source:'src/app/the-sideline/page.tsx'})
for(const [view,name]of Object.entries({core:'Game Day',touchdowns:'Touchdowns',props:'Player props','odds-board':'Full odds board',usage:'Usage',tracking:'Tracking',team:'Team context',all:'All columns',custom:'Custom columns'}))entries.push({name,href:'/the-sideline?view='+view,group:'NFL · board views',source:'src/app/the-sideline/SidelineBoardClient.tsx'})
for(const panel of ['trends','ladder','movement','tracking','court','markets'])entries.push({name:'Player drawer · '+label(panel),href:'/the-paint?player=900110&panel='+panel,group:'NBA · player panels',source:'src/app/the-paint/PaintPlayerPanel.tsx'})
entries.sort((a,b)=>a.group.localeCompare(b.group)||a.href.localeCompare(b.href))
await fs.writeFile(path.join(root,'review/catalog.json'),JSON.stringify(entries,null,2))
await fs.mkdir(path.join(root,'public/review-assets'),{recursive:true})
const assetSource=path.join(root,'../design-preview/dist/assets')
try{for(const name of await fs.readdir(assetSource))if(/\.png$/.test(name))await fs.copyFile(path.join(assetSource,name),path.join(root,'public/review-assets',name))}catch(error){if(error.code!=='ENOENT')throw error}
console.log('Private catalog: '+entries.length+' page and tool entries. Local identity assets copied.')
