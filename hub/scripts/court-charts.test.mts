import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement as h, type ComponentType } from 'react'
import { nbaMovementChartPoints } from '../src/lib/nbaMovementChart'
import { nbaMovement } from '../src/lib/nbaMovement'
import type { PaintProp } from '../src/lib/nbaPaint'

const require=createRequire(import.meta.url), {JSDOM}=require('jsdom')
const win=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://slipsurge.invalid',pretendToBeVisual:true}).window
Object.assign(globalThis,{window:win,document:win.document,HTMLElement:win.HTMLElement,SVGElement:win.SVGElement,IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot}=await import('react-dom/client')
const stubs:Record<string,string>={
  '@/components/nba/NbaMatrixContext':'export const useNbaMatrixMatches=()=>[]',
  '@/lib/nbaRefresh':'export const watchNbaRefresh=()=>()=>{}',
}
const bundle=await build({stdin:{contents:'export {ResearchLineChart} from "./src/components/research/ResearchLineChart";export {TrendBars} from "./src/app/the-paint/PaintVisuals";export {PaintShotChart} from "./src/app/the-paint/PaintShotChart"',resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'court-charts.cjs',platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],tsconfig:'tsconfig.json',loader:{'.css':'empty'},plugins:[{name:'chart-fixture',setup(builder){builder.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'fixture'}:undefined);builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stubs[args.path],loader:'tsx'}))}}]})
const module={exports:{} as Record<string,ComponentType<any>>}
new Function('require','module','exports',bundle.outputFiles[0].text)(require,module,module.exports)
async function mount(component:React.ReactNode){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(component));return{host,render:async(next:React.ReactNode)=>{await act(async()=>root.render(next))},close:async()=>{await act(async()=>root.unmount());host.remove()}}}
async function key(node:Element,value:string){await act(async()=>node.dispatchEvent(new win.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true})))}

test('market charts use the displayed exact-contract price, skip missing captures and preserve time spacing',()=>{
  const contract:PaintProp={id:1,game_id:10,player_id:20,vendor:'fanduel',prop_type:'points',line_value:'20',market:{type:'milestone',odds:-180},updated_at:'2030-11-20T10:00:00Z'}
  const frames=[
    {captured_at:'2030-11-20T10:00:00Z',props:[contract]},
    {captured_at:'2030-11-20T11:00:00Z',props:[{...contract,line_value:'25'}]},
    {captured_at:'2030-11-20T14:00:00Z',props:[{...contract,market:{type:'milestone' as const,odds:-210}},{...contract,id:2,market:{type:'milestone' as const,odds:105}}]},
  ]
  const movement=nbaMovement(frames,20,'points','fanduel')
  const points=nbaMovementChartPoints(frames,movement.points,contract)
  assert.equal(movement.priceLatestOdds,-210)
  assert.equal(points[2].value,210/310*100)
  assert.equal(points[1].value,null,'a different threshold cannot fill an absent exact quote')
  assert.equal(points[1].x,.25)
  assert.match(points[2].label,/ET$/)
})

test('line charts keep zero, break missing observations and expose chronological keyboard point navigation',async()=>{
  const ui=await mount(h(module.exports.ResearchLineChart,{label:'Observed usage',points:[{label:'Nov 1',value:0},{label:'Nov 2',value:2},{label:'Nov 3',value:null},{label:'Nov 4',value:3}]}))
  try {
    const buttons=[...ui.host.querySelectorAll<HTMLButtonElement>('button[data-line-point]')]
    assert.equal(buttons.length,3);assert.equal(buttons[0].getAttribute('aria-label'),'Nov 1: 0.0')
    const path=ui.host.querySelectorAll('svg path')[1].getAttribute('d')!
    assert.equal((path.match(/M/g)??[]).length,2,'the missing third observation splits the line')
    assert.equal((path.match(/L/g)??[]).length,1)
    assert.equal(buttons.filter(button=>button.tabIndex===0).length,1)
    await act(async()=>{buttons[0].focus();buttons[0].click()});await key(buttons[0],'ArrowRight')
    assert.equal(document.activeElement,buttons[1]);assert.match(ui.host.querySelector('output')!.textContent!,/Nov 2 · 2.0/)
    await key(buttons[1],'End');assert.equal(document.activeElement,buttons[2])
    await key(buttons[2],'Home');assert.equal(document.activeElement,buttons[0])
  } finally {await ui.close()}
})

test('touching the chart area selects the nearest observed point and keeps its detail after lift',async()=>{
 const ui=await mount(h(module.exports.ResearchLineChart,{label:'Observed usage',points:[{label:'Nov 1',value:0},{label:'Nov 2',value:2},{label:'Nov 3',value:null},{label:'Nov 4',value:3}]}))
 try{
  const plot=ui.host.querySelector('button[data-line-point]')!.parentElement!
  plot.getBoundingClientRect=()=>({left:0,top:0,width:400,height:200,right:400,bottom:200,x:0,y:0,toJSON(){}})
  const touch=new win.Event('pointerdown',{bubbles:true,cancelable:true})
  Object.defineProperties(touch,{pointerType:{value:'touch'},clientX:{value:360},clientY:{value:20}})
  await act(async()=>plot.dispatchEvent(touch))
  assert.equal(touch.defaultPrevented,false,'chart inspection must preserve native page scrolling')
  assert.match(ui.host.querySelector('output')!.textContent!,/Nov 4 · 3.0/)
  const leave=new win.Event('pointerout',{bubbles:true});Object.defineProperty(leave,'pointerType',{value:'touch'})
  await act(async()=>plot.dispatchEvent(leave))
  assert.match(ui.host.querySelector('output')!.textContent!,/Nov 4 · 3.0/)
  const active=ui.host.querySelector<HTMLButtonElement>('button[data-active="true"]')!
  await act(async()=>active.focus());await key(active,'Home')
  assert.match(ui.host.querySelector('output')!.textContent!,/Nov 1 · 0.0/)
 }finally{await ui.close()}
})

test('the touch scrubber visits known observations, skips missing values and survives a shorter sample',async()=>{
 const points=[{label:'Nov 1',value:0},{label:'Nov 2',value:null},{label:'Nov 3',value:3}]
 const ui=await mount(h(module.exports.ResearchLineChart,{label:'Observed usage',points}))
 try{
  const slider=ui.host.querySelector<HTMLInputElement>('input[type="range"]')!
  assert.equal(slider.max,'1','missing observations must not become selectable zeroes')
  assert.equal(slider.getAttribute('aria-label'),'Observation in Observed usage')
  assert.equal(slider.getAttribute('aria-describedby'),ui.host.querySelector('output')!.id)
  await act(async()=>{
   Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value')!.set!.call(slider,'1')
   slider.dispatchEvent(new win.Event('input',{bubbles:true}))
  })
  assert.match(ui.host.querySelector('output')!.textContent!,/Nov 3 · 3.0/)
  await act(async()=>{
   Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value')!.set!.call(slider,'0')
   slider.dispatchEvent(new win.Event('input',{bubbles:true}))
  })
  assert.match(ui.host.querySelector('output')!.textContent!,/Nov 1 · 0.0/)
  await ui.render(h(module.exports.ResearchLineChart,{label:'Observed usage',points:points.slice(0,1)}))
  assert.equal(ui.host.querySelector('input[type="range"]'),null)
  assert.match(ui.host.querySelector('output')!.textContent!,/Nov 1 · 0.0/)
 }finally{await ui.close()}
})

test('result bars distinguish an observed zero from an unavailable value and keep exact grades',async()=>{
  const logs=[0,null,10].map((pts,id)=>({id:id+1,pts,min:'30',game:{date:`2026-11-${18-id}`,season:2026},team:{id:2}}))
  const ui=await mount(h(module.exports.TrendBars,{logs,market:'points',line:5,side:'over',tall:true}))
  try {
    const bars=[...ui.host.querySelectorAll<HTMLButtonElement>('button[data-chart-bar]')]
    const zero=bars.find(button=>button.getAttribute('data-zero')==='true')!
    assert.equal(zero.getAttribute('data-known'),'true');assert.match(zero.getAttribute('aria-label')!,/0 · Miss/)
    assert.equal(zero.querySelector('span')!.style.height,'0%')
    const unknown=bars.find(button=>button.getAttribute('data-known')==='false')!
    assert.equal(unknown.querySelector('span'),null);assert.match(unknown.getAttribute('aria-label')!,/Unavailable/)
    const hit=bars.find(button=>button.getAttribute('data-result')==='win')!
    await act(async()=>bars[0].focus());await key(bars[0],'Home');await key(document.activeElement!,'End')
    assert.match(ui.host.querySelector('output')!.textContent!,/0 · Miss/)
    assert.match(hit.getAttribute('aria-label')!,/10 · Hit/)
  } finally {await ui.close()}
})

test('shortening a player sample keeps exactly one reachable chart bar and touch details stay selected',async()=>{
  const logs=Array.from({length:20},(_,index)=>({id:index+1,pts:index+1,min:'30',game:{date:`2026-11-${String(index+1).padStart(2,'0')}`,season:2026},team:{id:2}}))
  const props={market:'points',line:5,side:'over',tall:true}
  const ui=await mount(h(module.exports.TrendBars,{...props,logs}))
  try{
    let bars=[...ui.host.querySelectorAll<HTMLButtonElement>('button[data-chart-bar]')]
    await act(async()=>bars[0].focus());await key(bars[0],'End')
    assert.equal(bars[19].tabIndex,0)
    await ui.render(h(module.exports.TrendBars,{...props,logs:logs.slice(0,5)}))
    bars=[...ui.host.querySelectorAll<HTMLButtonElement>('button[data-chart-bar]')]
    assert.equal(bars.length,5)
    assert.equal(bars.filter(bar=>bar.tabIndex===0).length,1,'a removed sample point cannot strand keyboard users')
    await act(async()=>bars[1].click())
    const selected=ui.host.querySelector('output')!.textContent
    const leave=new win.Event('pointerout',{bubbles:true})
    Object.defineProperty(leave,'pointerType',{value:'touch'})
    await act(async()=>bars[1].dispatchEvent(leave))
    assert.equal(ui.host.querySelector('output')!.textContent,selected,'lifting a finger keeps the selected observation readable')
    assert.equal(bars[1].getAttribute('data-active'),'true')
  }finally{await ui.close()}
})

test('shot points provide one keyboard stop, arrow navigation and an accessible unmapped-shot log',async()=>{
  const prior=globalThis.fetch
  const shots=[{order:1,x:20,y:10,halfCourt:true,made:true,points:2,period:1,clock:'10:00',text:'Made layup'},{order:2,x:30,y:20,halfCourt:true,made:false,points:3,period:2,clock:'08:00',text:'Missed three'},{order:3,x:null,y:null,halfCourt:false,made:false,points:2,period:1,clock:'07:00',text:'Unmapped miss'}]
  globalThis.fetch=async input=>{assert.match(String(input),/researchGame=999/);assert.match(String(input),/mode=pregame/);return Response.json({gameId:50,playerId:1,shots,boxScoreAttempts:3,coverageMatches:true,stale:false})}
  const player={id:1,first_name:'Test',last_name:'Player',team:{id:2},logs:[{id:1,min:'30',team:{id:2},game:{id:50,date:'2026-11-18',season:2026,status:'Final',home_team_id:2,visitor_team_id:20}}]}
  const ui=await mount(h(module.exports.PaintShotChart,{player,researchGame:999,researchRevision:'frozen:test'}))
  try {
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30))})
    const points=[...ui.host.querySelectorAll<SVGGElement>('[data-shot-point]')]
    assert.equal(points.length,2);assert.equal(points.filter(point=>point.tabIndex===0).length,1)
    await act(async()=>points[0].focus());await key(points[0],'ArrowRight')
    assert.equal(document.activeElement,points[1]);assert.equal(points[1].getAttribute('aria-pressed'),'true')
    assert.match(ui.host.querySelector('[role="status"]')!.textContent!,/Missed three/)
    assert.match(ui.host.textContent!,/Unmapped miss/);assert.match(ui.host.textContent!,/1 shots off-map/)
    assert.equal(points[0].querySelector('circle')!.getAttribute('r'),'2.2')
    const result=ui.host.querySelector<HTMLSelectElement>('select[aria-label="Shot result"]')!
    await act(async()=>{result.value='made';result.dispatchEvent(new win.Event('change',{bubbles:true}))})
    assert.equal(ui.host.querySelectorAll('[data-shot-point]').length,1)
    assert.equal(ui.host.querySelector('[data-shot-point]')!.getAttribute('tabindex'),'0')
    const heatmap=[...ui.host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='Heatmap')!
    await act(async()=>heatmap.click())
    assert.equal(heatmap.getAttribute('aria-pressed'),'true')
    assert.equal(ui.host.querySelectorAll('[data-shot-point]').length,0)
    assert.match(ui.host.textContent!,/Made layup/,'the accessible shot log remains in heatmap mode')
  } finally {await ui.close();globalThis.fetch=prior}
})
