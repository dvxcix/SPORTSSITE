import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
const entry = `
import React from 'react';import {createRoot} from 'react-dom/client';
import {SidelineCheatsheets} from './src/app/the-sideline/SidelineCheatsheets';
const teams=[{abbr:'PHI',name:'Philadelphia Eagles',color:'#005a53',logo:null},{abbr:'CHI',name:'Chicago Bears',color:'#c54c20',logo:null}];
const players=['Very Long Player Name Robinson Jr.','Second Player'].map((name,i)=>({id:i+1,name,team:teams[i].abbr,position:'RB',markets:[{key:'anytime_td',propType:'anytime_td',line:1,offers:[{vendor:'fanduel',type:'milestone',line:1,current:{odds:350},opening:{odds:400}}]}]}));
const stats=players.map(p=>({...p,id:String(p.id),games:2,gameLog:[{scorerTouchdowns:1},{scorerTouchdowns:0}],projections:[],deepTargets:2,receiving20:1,receiving30:0,receiving40:0,rushing10:3,rushing20:1,rushing30:0,rushing40:0,carryShare:50}));
const lens={season:2026,players:stats,teams:teams.map(team=>({team,defenseSuccessAllowed:44,defenseExplosiveAllowed:12,redZoneTdRate:50})),runGaps:teams.map(team=>({team:team.abbr,opponent:teams.find(t=>t!==team).abbr,gap:'middle',edge:25,attempts:30,defenseAttempts:20,yardsPerCarry:5,defenseYardsPerCarry:4,successRate:40,explosiveRate:15})),dvp:teams.map(team=>({defense:team.abbr,position:'RB',stat:'rushing_yards',pctDiff:14,games:2}))};
createRoot(document.getElementById('root')).render(<SidelineCheatsheets lens={lens} board={{players}}/>);`
const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outdir:'.artifacts/sheets',platform:'browser',jsx:'automatic',plugins:[{name:'boundaries',setup(b){
 b.onResolve({filter:/^next\/image$|SidelineResearchClient$/},args=>({path:args.path,namespace:'stub'}))
 b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'import React from "react";export default ({unoptimized,...p})=><img {...p}/>;export const PlayerIdentity=({player})=><span>{player.name}</span>',loader:'jsx',resolveDir:process.cwd()}))
}}]})
const browser=await chromium.launch()
try{
 for(const width of [320,390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900},hasTouch:true})
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  await page.setContent('<style>*{box-sizing:border-box}body{margin:0;font-family:Arial}'+bundle.outputFiles.find(f=>f.path.endsWith('.css'))!.text+'</style><div id="root"></div>')
  await page.addScriptTag({content:bundle.outputFiles.find(f=>f.path.endsWith('.js'))!.text})
  for(const view of ['Market Edge','Exact-Line Hits','Explosive Plays','Run Gaps','Defense / DvP']){
   await page.getByRole('button',{name:view,exact:true}).click()
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow '+view)
   if(view==='Run Gaps'||view==='Defense / DvP')assert.equal(await page.getByPlaceholder('Search player, team, role').count(),0)
   else{
    assert(await page.locator('tbody tr').count()>0,'populated rows '+view)
    const region=page.getByRole('region',{name:view+' table'})
    await region.evaluate(el=>{el.scrollLeft=600})
    assert.equal(await page.locator('tbody td').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(12, 20, 28)')
    await region.evaluate(el=>{el.scrollLeft=0})
   }
  }
  assert.deepEqual(errors,[])
  console.log(width+'px: all five populated tabs, controls, scroll regions and opaque pinned cells PASS')
  await page.close()
 }
}finally{await browser.close()}
