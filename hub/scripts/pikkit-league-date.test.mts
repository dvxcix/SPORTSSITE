import assert from 'node:assert/strict'
import test from 'node:test'
import type { Page, Request, Response } from 'playwright-core'
import { observePikkitLeagueDates, pikkitLeagueDates } from '../src/lib/scrapers/pikkitLeagueDate.ts'

const filters=Array.from({length:15},(_,index)=>({value:`2026-10-${String(index+15).padStart(2,'0')}`,label:`Oct ${index+15}`}))
const current=filters[3].value
const origin='https://prod-website.pikkit.app'

async function fixture(options:{today?:string;respond?:boolean;disabled?:boolean}={}){
  const listeners={request:new Set<(value:Request)=>void>(),response:new Set<(value:Response)=>void>()}
  const clicks:string[]=[]
  let center=3
  let wait:{predicate:(response:Response)=>boolean;resolve:(response:Response)=>void}|null=null
  const visible=(label:string)=>filters.slice(Math.max(0,center-3),Math.min(filters.length,center+4)).filter(item=>(item.value===options.today?'Today':item.label)===label)
  const emit=(path:string,payload:unknown,requestSeen=true)=>{
    const request={url:()=>`${origin}${path}`} as Request
    const response={url:request.url,status:()=>200,request:()=>request,json:async()=>payload} as Response
    if(requestSeen)for(const callback of listeners.request)callback(request)
    for(const callback of listeners.response)callback(response)
    if(wait?.predicate(response))wait.resolve(response)
    return response
  }
  const page={
    on:(event:keyof typeof listeners,callback:never)=>listeners[event].add(callback),
    off:(event:keyof typeof listeners,callback:never)=>listeners[event].delete(callback),
    evaluate:async()=>options.today??'2026-10-18',
    getByText:(label:string)=>{const locator={filter:()=>locator,count:async()=>visible(label).length,waitFor:async()=>{},click:async()=>{clicks.push(label);const item=visible(label)[0];assert.ok(item);if(options.respond!==false)emit(`/league/events?league=nba&date=${item.value}`,[])}};return locator},
    getByRole:(_role:string,{name}:{name:string})=>({count:async()=>1,isEnabled:async()=>!options.disabled,click:async()=>{clicks.push(name);center+=name==='date-forward'?3:-3}}),
    waitForResponse:(predicate:(response:Response)=>boolean)=>new Promise<Response>(resolve=>{wait={predicate,resolve}}),
  } as unknown as Page
  const observer=observePikkitLeagueDates(page)
  emit('/league/filters?league=nba',{current,filters})
  await Promise.resolve()
  return{observer,clicks,emit,listeners}
}

test('current source date needs no click and an unavailable date is not guessed',async()=>{
  const f=await fixture()
  try{assert.equal(await f.observer.selectDate(current),true);assert.equal(await f.observer.selectDate('2026-11-10'),false);assert.deepEqual(f.clicks,[])}finally{f.observer.dispose()}
})

test('a visible requested date uses its exact source label and waits for that date response',async()=>{
  const f=await fixture({respond:false})
  try{
    let settled=false
    const selected=f.observer.selectDate(filters[4].value).then(value=>{settled=true;return value})
    for(let i=0;i<5;i++)await Promise.resolve()
    f.emit(`/league/events?league=nba&date=${current}`,[])
    await Promise.resolve();assert.equal(settled,false)
    f.emit(`/league/events?league=nba&date=${filters[4].value}`,[])
    assert.equal(await selected,true);assert.deepEqual(f.clicks,[filters[4].label])
  }finally{f.observer.dispose()}
})

test('date window moves through the actual arrow at most twice',async()=>{
  const f=await fixture()
  try{assert.equal(await f.observer.selectDate(filters[10].value),true);assert.deepEqual(f.clicks,['date-forward','date-forward',filters[10].label])}finally{f.observer.dispose()}
  const distant=await fixture()
  try{assert.equal(await distant.observer.selectDate(filters[14].value),false);assert.deepEqual(distant.clicks,['date-forward','date-forward'])}finally{distant.observer.dispose()}
})

test('source Today substitution and disabled navigation remain honest',async()=>{
  const today=await fixture({today:filters[4].value})
  try{assert.equal(await today.observer.selectDate(filters[4].value),true);assert.deepEqual(today.clicks,['Today'])}finally{today.observer.dispose()}
  const disabled=await fixture({disabled:true})
  try{assert.equal(await disabled.observer.selectDate(filters[10].value),false);assert.deepEqual(disabled.clicks,[])}finally{disabled.observer.dispose()}
})

test('late prior-page responses cannot replace the observed league dates and disposal cancels success',async()=>{
  const f=await fixture({respond:false})
  f.emit('/league/filters?league=nba',{current:filters[10].value,filters},false)
  await Promise.resolve()
  assert.equal(await f.observer.selectDate(current),true)
  const selected=f.observer.selectDate(filters[4].value)
  for(let i=0;i<5;i++)await Promise.resolve()
  f.observer.dispose()
  f.emit(`/league/events?league=nba&date=${filters[4].value}`,[])
  assert.equal(await selected,false);assert.equal(f.listeners.request.size,0);assert.equal(f.listeners.response.size,0)
})

test('malformed, impossible or ambiguous source filter dates are rejected',()=>{
  for(const value of [null,{}, {current,filters:[]},{current:'2026-02-30',filters:[{value:'2026-02-30',label:'Feb 30'}]}, {current,filters:[filters[3],filters[3]]}, {current,filters:[{value:current,label:''}]}])assert.equal(pikkitLeagueDates(value),null)
  assert.deepEqual(pikkitLeagueDates({current,filters}),{current,filters})
})
