import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import type { Page } from 'playwright-core'
import { findAndClickPikkitGame } from '../src/lib/scrapers/gameMatch.ts'

const require=createRequire(import.meta.url)
const {JSDOM}=require('jsdom')
const teams='<span>Atlanta Hawks</span><span>Orlando Magic</span>'

async function clickGame(html:string){
  const dom=new JSDOM(`<body>${html}</body>`,{url:'https://app.pikkit.com/leagues/nba'})
  Object.defineProperty(dom.window.HTMLElement.prototype,'innerText',{get(){return this.textContent}})
  const previous={document:globalThis.document,Node:globalThis.Node}
  globalThis.document=dom.window.document;globalThis.Node=dom.window.Node
  const clicked:string[]=[]
  for(const element of Array.from(document.querySelectorAll<HTMLElement>('[id]')))element.addEventListener('click',event=>{event.preventDefault();clicked.push(element.id)})
  class FixtureLocator {
    constructor(private elements:HTMLElement[]){}
    filter({hasText}:{hasText:RegExp}){return new FixtureLocator(this.elements.filter(element=>hasText.test(element.textContent||'')))}
    async count(){return this.elements.length}
    nth(index:number){return new FixtureLocator(this.elements.slice(index,index+1))}
    async evaluate<T,A>(callback:(element:HTMLElement,args:A)=>T,args:A){return callback(this.elements[0],args)}
    async click(){this.elements[0].click()}
  }
  const page={
    locator:(selector:string)=>new FixtureLocator(Array.from(document.querySelectorAll<HTMLElement>(selector))),
    evaluate:async<T,A>(callback:(args:A)=>T,args:A)=>callback(args),
  } as unknown as Page
  try{return{found:await findAndClickPikkitGame(page,'Atlanta Hawks','Orlando Magic'),clicked}}
  finally{globalThis.document=previous.document;globalThis.Node=previous.Node;dom.window.close()}
}

test('a both-team card with a single auth button never clicks it or reports a game found',async()=>{
  for(const label of ['Sign in','Log in','Sign up','Create an account','Subscribe','Verify your phone']){
    const result=await clickGame(`<section>${teams}<button id="auth">${label}</button></section>`)
    assert.deepEqual(result,{found:false,clicked:[]},label)
  }
})

test('auth destinations are blocked even when their link text matches both teams or says More wagers',async()=>{
  for(const href of ['/login','/auth/login','/pro','/join','#/login']){
    assert.deepEqual(await clickGame(`<a id="auth" href="${href}">${teams}</a>`),{found:false,clicked:[]},href)
    assert.deepEqual(await clickGame(`<section>${teams}<a id="auth" href="${href}">More wagers</a></section>`),{found:false,clicked:[]},href)
  }
})

test('icon-only auth controls and authentication ancestors are not game navigation',async()=>{
  assert.deepEqual(await clickGame(`<section>${teams}<button id="auth" aria-label="Sign in"></button></section>`),{found:false,clicked:[]})
  assert.deepEqual(await clickGame(`<a id="auth" href="/login"><section>${teams}</section></a>`),{found:false,clicked:[]})
})

test('native event links and legacy More wagers controls retain game navigation',async()=>{
  assert.deepEqual(await clickGame(`<a id="event" href="/event/fixture">${teams}</a>`),{found:true,clicked:['event']})
  assert.deepEqual(await clickGame(`<section>${teams}<a id="event" href="/event/fixture">More wagers</a></section>`),{found:true,clicked:['event']})
})

test('the source SPA matchup container remains clickable without an anchor or button',async()=>{
  assert.deepEqual(await clickGame(`<section id="event">${teams}<span>7:00 PM</span></section>`),{found:true,clicked:['event']})
})

test('unrelated team cards remain unlisted',async()=>{
  assert.deepEqual(await clickGame('<section id="other"><span>Chicago Bulls</span><span>Toronto Raptors</span></section>'),{found:false,clicked:[]})
})
