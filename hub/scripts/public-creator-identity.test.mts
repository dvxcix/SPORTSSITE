import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { act, createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { build } from 'esbuild'
import { publicCreatorDirectory, findPublicCreators, lowestCreatorMembership, type PublicCreatorIdentity, type PublishedCreatorStore } from '../src/lib/publicCreatorDirectory'

const person:PublicCreatorIdentity={id:'creator-1',username:'real-person',display_name:'Actual Person',avatar_url:'/person-avatar.png',avatar_ring_style:'orbit',avatar_ring_color:'#b4ff4d',banner_url:'/person-banner.png',bio:'My public research and observations.',follower_count:12,is_verified:true,creator_products:[]}
const store:PublishedCreatorStore={creator:person,creator_id:person.id,name:'Different Store Name',bio:'A distinct storefront introduction.',logo_url:'/store-logo.png',cover_url:'/store-cover.png',sports:['NBA'],tags:['Player props'],featured:true,featured_rank:1,access_mode:'free'}
const other:PublicCreatorIdentity={...person,id:'creator-2',username:'football-person',display_name:'Football Person',avatar_url:'/football-avatar.png',avatar_ring_style:'solid',bio:'Football film and conversations.',follower_count:4,creator_products:[{id:'offer-2',title:'Football membership',description:'Football research',price:20,product_type:'membership'}]}

test('published storefronts decorate their person without replacing name, bio, images or ring',()=>{
  const [creator]=publicCreatorDirectory([person],[store])
  for(const key of ['id','username','display_name','avatar_url','banner_url','bio','avatar_ring_style','avatar_ring_color'] as const)assert.equal(creator[key],person[key],key)
  assert.equal(creator.storefront?.name,store.name);assert.equal(creator.storefront?.logo_url,store.logo_url)
  assert.deepEqual(creator.sports,['NBA']);assert.deepEqual(creator.tags,['Player props'])
})

test('a published free creator remains discoverable without a paid product and mismatched owners are ignored',()=>{
  const rows=publicCreatorDirectory([], [store,{...store,creator_id:'not-the-person'}])
  assert.equal(rows.length,1);assert.equal(rows[0].username,person.username)
  assert.equal(rows[0].creator_products.length,0);assert.equal(lowestCreatorMembership(rows[0]),0)
  assert.equal(publicCreatorDirectory([], [{...store,creator:null}]).length,0)
})

test('search keeps person, storefront and membership terms searchable while sport filters and sorting use real values',()=>{
  const creators=publicCreatorDirectory([other],[store])
  for(const query of ['Actual Person','real-person','public research','Different Store','distinct storefront','Player props'])assert.deepEqual(findPublicCreators(creators,query,'all','featured').map(row=>row.id),[person.id],query)
  assert.deepEqual(findPublicCreators(creators,'membership','NFL','name'),[])
  assert.deepEqual(findPublicCreators(creators,'Football membership','all','name').map(row=>row.id),[other.id])
  assert.deepEqual(findPublicCreators(creators,'','NBA','name').map(row=>row.id),[person.id])
  assert.deepEqual(findPublicCreators(creators,'','all','price').map(row=>row.id),[person.id,other.id])
  assert.deepEqual(findPublicCreators(creators,'','all','name').map(row=>row.id),[person.id,other.id])
  assert.equal(lowestCreatorMembership({...creators[1],storefront:undefined,creator_products:[]}),null)
})

test('directory query visibility retains published stores, active offers and the legacy role requirement',async()=>{
  const source=await readFile('src/lib/creatorDirectoryServer.ts','utf8')
  assert.match(source,/\.eq\('status','published'\)/)
  assert.match(source,/\.eq\('creator\.creator_products\.status','active'\)/)
  assert.match(source,/\.in\('account_type', \['creator', 'admin'\]\)/)
  assert.match(source,/\.eq\('creator_products\.status', 'active'\)/)
  assert.doesNotMatch(source,/display_name:row\.name|avatar_url:row\.logo_url|avatar_ring_style:'none'/)
})

const require=createRequire(import.meta.url),{JSDOM}=require('jsdom')
const win=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://slipsurge.invalid/creators',pretendToBeVisual:true}).window
Object.assign(globalThis,{window:win,document:win.document,HTMLElement:win.HTMLElement,Node:win.Node,IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot}=await import('react-dom/client')
type Row=Record<string,unknown>
const profileFixture={published:true,blocked:false,viewer:null as {id:string}|null}
class Query {
  filters:Array<[string,unknown]>=[];one=false
  constructor(readonly name:string){}
  select(){return this}eq(key:string,value:unknown){this.filters.push([key,value]);return this}order(){return this}limit(){return this}is(){return this}
  single(){this.one=true;return this}maybeSingle(){this.one=true;return this}
  then(done:(value:{data:Row[]|Row|null;error:unknown})=>unknown,fail:(cause:unknown)=>unknown){
    let rows:Row[]=this.name==='users'?[{...person,account_type:'user'}]:this.name==='creator_storefronts'?[{...store,status:profileFixture.published?'published':'draft'}]:[]
    rows=rows.filter(row=>this.filters.every(([key,value])=>row[key]===value))
    return Promise.resolve({data:this.one?rows[0]??null:rows,error:this.name==='posts'?publicPostFailure:null}).then(done,fail)
  }
}
Object.assign(globalThis,{
  creatorIdentityFixture:{profile:profileFixture,client:{
    from:(name:string)=>new Query(name),
    auth:{getUser:async()=>({data:{user:profileFixture.viewer}})},
  }},
})
const stubs:Record<string,string>={
  'next/link':`import{createElement as h}from'react';export default({children,...props})=>h('a',props,children)`,
  'next/navigation':`export const notFound=()=>{throw Error('NOT_FOUND')}`,
  '@/lib/supabase/server':`export const createClient=async()=>globalThis.creatorIdentityFixture.client`,
  '@/components/social/MemberAvatar':`import{createElement as h}from'react';export const MemberAvatar=({name,src,ringStyle,ringColor})=>h('span',{role:'img','aria-label':name+' avatar','data-avatar-src':src,'data-ring':ringStyle,'data-ring-color':ringColor})`,
  '@/components/ui/SafeImage':`import{createElement as h}from'react';export const SafeImage=({src,alt})=>src?h('img',{src,alt}):null`,
  '@/components/creator/CreatorFunnelSignal':`export const CreatorFunnelSignal=()=>null`,
  '@/components/groups/CommunityDirectory':`export const CommunityDirectory=()=>null`,
  '@/lib/creatorCommunityDirectory':`export const publishedPaidCommunities=async()=>[]`,
  '@/lib/creatorCommerce':`export const hasCurrentCreatorAccess=()=>false`,
  '@/lib/mlbViewerAccess':`export const canViewMlb=async()=>false`,
  '@/lib/visiblePickRecords':`export const hydrateVisibleAuthorRecords=async()=>({posts:[]})`,
  '@/lib/feedQuery':`export const POST_WITH_AUTHOR='id'`,
  '@/components/social/PostCardClient':`export const PostCardClient=()=>null`,
  '@/lib/blocks':`export const isBlockedEitherWay=async()=>globalThis.creatorIdentityFixture.profile.blocked`,
  '../offers/[productId]/CheckoutButton':`export const CheckoutButton=()=>null`,
}
const bundle=await build({stdin:{contents:'export{CreatorDirectory}from"./src/app/creators/CreatorDirectory";export{default as CreatorProfile}from"./src/app/creators/[username]/page"',resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'creator-identity.cjs',platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],loader:{'.css':'empty'},tsconfig:'tsconfig.json',plugins:[{name:'creator-identity-fixtures',setup(builder){builder.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'fixture'}:undefined);builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:stubs[args.path],loader:'tsx'}))}}]})
const compiled={exports:{} as {CreatorDirectory:typeof import('../src/app/creators/CreatorDirectory').CreatorDirectory;CreatorProfile:typeof import('../src/app/creators/[username]/page').default}}
new Function('require','module','exports',bundle.outputFiles[0].text)(require,compiled,compiled.exports)

test('rendered creator directory presents people and rings with separate storefront and member-profile destinations',()=>{
  const markup=renderToStaticMarkup(h(compiled.exports.CreatorDirectory,{creators:publicCreatorDirectory([other],[store])}))
  const host=document.createElement('div');host.innerHTML=markup
  const card=[...host.querySelectorAll('article')].find(article=>article.querySelector('h2')?.textContent===person.display_name)!
  assert.ok(card);assert.equal(card.querySelector('[data-avatar-src]')?.getAttribute('data-avatar-src'),person.avatar_url)
  assert.equal(card.querySelector('[data-ring]')?.getAttribute('data-ring'),person.avatar_ring_style)
  assert.ok(card.querySelector('img[src="/person-banner.png"]'));assert.ok(card.querySelector('img[src="/store-logo.png"]'))
  assert.ok(card.querySelector('a[href="/creators/real-person"]'));assert.ok(card.querySelector('a[href="/profile/real-person"]'));assert.ok(card.querySelector('a[href="/creators/real-person#memberships"]'))
  assert.match(card.textContent!,/Different Store Name/);assert.match(card.textContent!,/My public research/)
  assert.doesNotMatch(card.querySelector('h2')!.textContent!,/Different Store/)
})

test('creator directory search, sports, sort and clear controls update the displayed people',async()=>{
  const creators=publicCreatorDirectory([other],[store]),host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  await act(async()=>root.render(h(compiled.exports.CreatorDirectory,{creators})))
  const input=host.querySelector<HTMLInputElement>('input')!
  const search=async(value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new win.Event('input',{bubbles:true}))})
  try{
    await search('Different Store');assert.equal(host.querySelectorAll('article').length,1);assert.equal(host.querySelector('article h2')!.textContent,'Actual Person')
    await search('missing');assert.match(host.querySelector('h2')!.textContent!,/No creators match/)
    const clear=[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='Clear filters')!
    await act(async()=>clear.click());assert.equal(host.querySelectorAll('article').length,2)
    const nba=[...host.querySelectorAll<HTMLButtonElement>('nav button')].find(button=>button.textContent==='NBA')!
    await act(async()=>nba.click());assert.equal(host.querySelectorAll('article').length,1)
    assert.equal(nba.getAttribute('aria-pressed'),'true')
    const sort=host.querySelector<HTMLSelectElement>('select')!;await act(async()=>{sort.value='name';sort.dispatchEvent(new win.Event('change',{bubbles:true}))})
    assert.equal(host.querySelector('article h2')!.textContent,'Actual Person')
  }finally{await act(async()=>root.unmount());host.remove()}
})

let publicPostFailure:unknown=null

test('published free creator profile keeps its person header and separate storefront branding without a paid offer',async()=>{
  profileFixture.published=true;profileFixture.viewer=null;profileFixture.blocked=false
  const markup=renderToStaticMarkup(await compiled.exports.CreatorProfile({params:Promise.resolve({username:person.username})}))
  const host=document.createElement('div');host.innerHTML=markup
  assert.equal(host.querySelector('h1')!.textContent,person.display_name)
  assert.equal(host.querySelector('[data-avatar-src]')?.getAttribute('data-avatar-src'),person.avatar_url)
  assert.equal(host.querySelector('[data-ring]')?.getAttribute('data-ring'),person.avatar_ring_style)
  assert.ok([...host.querySelectorAll('h2')].some(heading=>heading.textContent===store.name))
  assert.ok(host.querySelector('img[src="/store-cover.png"]'));assert.ok(host.querySelector('a[href="/profile/real-person"]'))
  assert.ok(markup.includes(person.bio!));assert.ok(markup.includes(store.bio))
})

test('failed public-post preview keeps the creator and storefront accessible with an honest unavailable state',async()=>{
  profileFixture.published=true;profileFixture.viewer=null;profileFixture.blocked=false
  publicPostFailure={code:'42501',message:'Private helper unavailable'}
  try{
    const markup=renderToStaticMarkup(await compiled.exports.CreatorProfile({params:Promise.resolve({username:person.username})}))
    const host=document.createElement('div');host.innerHTML=markup
    assert.equal(host.querySelector('h1')!.textContent,person.display_name)
    assert.ok([...host.querySelectorAll('h2')].some(heading=>heading.textContent===store.name))
    assert.match(host.querySelector('[role="status"]')!.textContent!,/Public posts are temporarily unavailable/)
    assert.doesNotMatch(markup,/No public research posted yet|Private helper unavailable/)
    assert.ok(host.querySelector('a[href="#memberships"]'))
  }finally{publicPostFailure=null}
})

test('unpublished ordinary profiles and blocked creator profiles still fail closed',async()=>{
  profileFixture.published=false;profileFixture.viewer=null
  try{await assert.rejects(()=>compiled.exports.CreatorProfile({params:Promise.resolve({username:person.username})}),/NOT_FOUND/)}finally{profileFixture.published=true}
  profileFixture.viewer={id:'viewer'};profileFixture.blocked=true
  try{await assert.rejects(()=>compiled.exports.CreatorProfile({params:Promise.resolve({username:person.username})}),/NOT_FOUND/)}finally{profileFixture.viewer=null;profileFixture.blocked=false}
})
