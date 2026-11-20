import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import postcss from 'postcss'
import ts from 'typescript'
import {withPrivateDesignReview} from '../review/config.ts'
import {nbaHeatStyle} from '../src/app/the-paint/paintHeat.ts'
import {NextRequest} from 'next/server'
import {reviewHttp} from '../review/http.ts'
import {nbaUnpackFullBoard} from '../src/lib/nbaFullOddsBoard.ts'
import {nbaReadOddsBoardPhase} from '../src/lib/nbaOddsBoardPhase.ts'
import {getSidelineGames,getCachedSidelineCheatsheetLens,makeNflOdds} from '../review/nfl.ts'
import {createClient as createReviewClient} from '../review/supabase.ts'

const css=postcss.parse(await fs.readFile(new URL('../src/app/framework.css',import.meta.url),'utf8'))
const palettes={dark:{},light:{}}
css.walkRules(rule=>{if(rule.selector===':root,[data-theme="dark"]'||rule.selector==='[data-theme="light"]'){const mode=rule.selector.includes(':root')?'dark':'light';rule.walkDecls(d=>{palettes[mode][d.prop]=d.value})}})
const rgb=hex=>{const value=hex.length===4?'#'+hex.slice(1).split('').map(c=>c+c).join(''):hex;return [0,2,4].map(i=>parseInt(value.slice(1+i,3+i),16))}
const luminance=hex=>rgb(hex).map(n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0)
const contrast=(a,b)=>{const l=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (l[0]+.05)/(l[1]+.05)}

test('conditional and embedded primary buttons use the fill role with primary ink',async()=>{
 let checked=0
 async function visit(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){
  const file=new URL(item.name+(item.isDirectory()?'/':''),dir)
  if(item.isDirectory()){if(item.name!=='api')await visit(file);continue}
  if(!/\.(tsx|css)$/.test(item.name))continue
  const code=await fs.readFile(file,'utf8')
  for(const body of code.match(/\{[^{}]*\}/g)??[])if(/color\s*:\s*var\(--accent-fg\)/.test(body))assert.doesNotMatch(body,/background(?:-color)?\s*:\s*var\(--accent\)/,file.pathname)
  if(!item.name.endsWith('.tsx'))continue
  const source=ts.createSourceFile(file.pathname,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  function walk(node){
   if(ts.isObjectLiteralExpression(node)){
    const props=Object.fromEntries(node.properties.filter(ts.isPropertyAssignment).map(prop=>[prop.name.getText(source),prop.initializer]))
    if(props.color?.getText(source).includes('var(--accent-fg)')){
     checked++
     const background=props.background??props.backgroundColor
     if(background)assert.doesNotMatch(background.getText(source),/['"]var\(--accent\)['"]/,file.pathname+':'+(source.getLineAndCharacterOfPosition(background.pos).line+1))
    }
   }
   ts.forEachChild(node,walk)
  }
  walk(source)
 }}
 await visit(new URL('../src/',import.meta.url))
 assert.ok(checked>0,'Audit real inline primary states as well as CSS declarations')
})

for(const [mode,tokens]of Object.entries(palettes))test(mode+' text and action roles meet normal-text contrast',()=>{
 for(const fg of ['--text-1','--text-2','--text-3','--text-4','--accent','--red','--green','--blue','--gold','--purple'])for(const bg of ['--bg','--surface','--surface-2','--surface-3'])assert.ok(contrast(tokens[fg],tokens[bg])>=4.5,`${mode}: ${fg} on ${bg} = ${contrast(tokens[fg],tokens[bg]).toFixed(2)}`)
 assert.ok(contrast(tokens['--accent-fg'],tokens['--accent-fill'])>=7,'Primary actions need a distinct readable label')
})

test('heatmaps use the shared theme surface and text roles at both extremes',()=>{
 for(const tone of ['volume','performance'])for(const value of [0,25,50,75,100]){
  const style=nbaHeatStyle(value,50,tone)
  assert.equal(style['--heat-ink'],'var(--text-1)')
  assert.match(style['--heat-fill'],/color-mix\(in srgb, rgb\([\d ]+\) \d+(?:\.\d+)?%, var\(--surface\)\)/)
 }
})

test('filled primary controls keep readable labels across feature stylesheets',async()=>{
 let checked=0
 async function visit(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){
  const file=new URL(item.name+(item.isDirectory()?'/':''),dir)
  if(item.isDirectory()){if(item.name!=='api')await visit(file);continue}
  if(!item.name.endsWith('.css'))continue
  postcss.parse(await fs.readFile(file,'utf8')).walkRules(rule=>{
   const values={};rule.nodes.filter(node=>node.type==='decl').forEach(node=>{values[node.prop]=node.value})
   if((values.background??values['background-color'])!=='var(--accent-fill)')return
   const role=values.color?.match(/^var\((--[\w-]+)\)$/)?.[1]
   if(!role)return
   for(const [mode,tokens]of Object.entries(palettes))if(tokens[role])assert.ok(contrast(tokens[role],tokens['--accent-fill'])>=4.5,`${file.pathname}: ${rule.selector}, ${mode}`)
   checked++
  })
 }}
 await visit(new URL('../src/',import.meta.url))
 assert.ok(checked>30,'Check the actual feature controls as well as the shared palette')
})

test('private review cannot be enabled for production or Vercel',()=>{
 const keys=['NODE_ENV','SLIPSURGE_UI_REVIEW','SLIPSURGE_UI_REVIEW_BUILD','VERCEL'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
 try{
  delete process.env.SLIPSURGE_UI_REVIEW_BUILD;process.env.SLIPSURGE_UI_REVIEW='1';process.env.NODE_ENV='production';delete process.env.VERCEL
  assert.throws(()=>withPrivateDesignReview({}),/only with next dev/)
  process.env.SLIPSURGE_UI_REVIEW_BUILD='1';assert.equal(withPrivateDesignReview({}).distDir,'.next-private-ui-review');process.env.NODE_ENV='development';process.env.VERCEL='1'
  assert.throws(()=>withPrivateDesignReview({}),/only with next dev/)
  delete process.env.VERCEL;delete process.env.SLIPSURGE_UI_REVIEW_BUILD
  assert.equal(withPrivateDesignReview({}).env.NEXT_PUBLIC_DESIGN_REVIEW,'1')
  delete process.env.SLIPSURGE_UI_REVIEW;process.env.NODE_ENV='production'
  const config=withPrivateDesignReview({})
  assert.equal(config.env.NEXT_PUBLIC_DESIGN_REVIEW,'0')
  assert.equal(config.webpack,undefined,'The production configuration must not install mock aliases')
 }finally{for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}}
})

test('illustrative research fixtures satisfy the real board contracts',async()=>{
 const read=async path=>(await reviewHttp(new NextRequest('http://127.0.0.1:4180'+path))).json()
 const wire=await read('/the-paint/odds-board?market=points&book=fanduel')
 const board=nbaUnpackFullBoard(wire,'points')
 assert.ok(board.cells.length>20)
 assert.ok(board.cells.every(cell=>cell.vendor==='fanduel'))
 const phase=await reviewHttp(new NextRequest('http://127.0.0.1:4180/the-paint/board?phase_only=1'))
 assert.ok(nbaReadOddsBoardPhase(phase.headers.get('X-NBA-Slate-Phase'),board.date,Date.now()))
 const tracking=await read('/the-paint/tracking')
 assert.ok(tracking.rows.every(row=>Number.isFinite(row.values.usage_percentage)))
 const favorites=await read('/api/account/favorites')
 assert.ok(Array.isArray(favorites.teams)&&Array.isArray(favorites.players))
 const nfl=await getSidelineGames()
 assert.equal(nfl.days[0].week,12)
 const cheat=await getCachedSidelineCheatsheetLens()
 assert.ok(cheat.teams.length===2&&cheat.players.every(p=>p.gameLog.length===10&&Array.isArray(p.projections)))
 assert.ok(makeNflOdds().players.every(p=>p.publicPicks.length>0))
 const mastery=await createReviewClient().rpc('get_member_mastery')
 assert.ok(Number.isFinite(mastery.data.points)&&Array.isArray(mastery.data.missions))
 const blocked=await reviewHttp(new NextRequest('http://127.0.0.1:4180/api/admin/example',{method:'POST'}))
 assert.equal(blocked.status,409)
})
