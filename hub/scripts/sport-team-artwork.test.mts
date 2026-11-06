/* eslint-disable @typescript-eslint/no-explicit-any -- Runtime bundle fixture exports are intentionally dynamic. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const stubs: Record<string, string> = {
  'next/navigation': 'export const useRouter=()=>({push(){}})',
  'next/link': 'export default function Link({children,href}){return <a href={href}>{children}</a>}',
  'motion/react': 'export const motion={article:({children})=><article>{children}</article>,button:({children})=><button>{children}</button>}',
  '@/lib/supabase/client': 'export const createClient=()=>({})',
  '@/lib/notify': 'export const notify=()=>{}',
  '@/lib/mentions': 'export const notifyMentions=()=>{}',
  '@/context/AuthContext': 'export const useAuth=()=>({user:null,profile:null,loading:false})',
  '@/context/PostLiveContext': 'export const usePostLiveUpdates=()=>{}',
  '@/components/ui/FeedbackProvider': 'export const useFeedback=()=>({confirm:()=>{},notify:()=>{}})',
  '@/lib/emoji': 'export const useCustomEmojis=()=>[]',
  '@/lib/blocks': 'export const getBlockedEitherWayIds=async()=>[]',
  './MentionProfileCard': 'export const ProfileHoverTarget=({children})=><span>{children}</span>',
  './LinkifiedText': 'export const LinkifiedText=({text})=><span>{text}</span>',
  './MemberAvatar': 'export const MemberAvatar=()=>null',
  './UserBadges': 'export const UserBadges=()=>null',
  './ReportModal': 'export const ReportModal=()=>null',
  './BlockUserButton': 'export const BlockUserButton=()=>null',
  './ShareImageModal': 'export const ShareImageModal=()=>null',
  './EmojiPicker': 'export const EmojiPicker=()=>null',
  './GifPicker': 'export const GifPicker=()=>null',
  './SlateEdgeEvidenceCard': 'export const SlateEdgeEvidenceCard=()=>null',
  '@/lib/slateEdgeEvidence': 'export const isSlateEdgeEvidence=()=>false',
  '@/components/ui/tooltip-card': 'export const Tooltip=({children})=><span>{children}</span>',
  '@/components/BookLogo': 'export const BookLogo=()=>null',
}
const bundle = await build({
  stdin: { contents: 'export * from "./src/lib/sportTeamArtwork"; export {PlayerAvatar} from "./src/components/sports/PlayerAvatar"; export {PostCardClient} from "./src/components/social/PostCardClient"; export {TeamMark} from "./src/components/sports/TeamMark";', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'],
  tsconfig: 'tsconfig.json', plugins: [{ name: 'artwork-fixture', setup(builder) {
    builder.onResolve({ filter: /^@slipsurge\/core\// }, args => ({ path: resolve('packages/core/src', args.path.replace('@slipsurge/core/', '') + '.ts') }))
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'stub' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: resolve('.') }))
  } }],
})
const compiled = { exports: {} as Record<string, any> }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports)
const { sportTeamLogoUrl: logo, sportTeamBackground: background, PlayerAvatar, PostCardClient } = compiled.exports
const render = (component: any, props: Record<string, unknown>) => renderToStaticMarkup(createElement(component, props))

test('Baltimore and shared abbreviations stay in their explicit league', () => {
  for (const team of ['BAL', 'ATL', 'DET', 'HOU', 'MIN', 'PHI', 'SEA', 'TB']) {
    assert.match(logo('NFL', team), /\/nfl\//)
    assert.match(logo('MLB', team), /mlbstatic\.com/)
    assert.notEqual(logo('NFL', team), logo('MLB', team))
  }
  assert.match(logo(' nba ', ' atl '), /\/nba\//)
  assert.equal(logo(undefined, 'BAL'), null)
  for (const bad of ['NHL', 'soccer', '__proto__']) assert.equal(logo(bad, 'BAL'), null)
  for (const bad of ['__proto__', 'constructor', '../bal', 'not a team']) assert.equal(logo('nfl', bad), null)
})

test('all NFL teams and supported historical aliases have explicit local logos', () => {
  const teams = 'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split(' ')
  assert.equal(new Set(teams.map(team => logo('nfl', team))).size, 32)
  for (const team of teams) assert.match(logo('nfl', team), /^https:\/\/a\.espncdn\.com\/i\/teamlogos\/nfl\//)
  for (const [alias, team] of [['JAC','JAX'],['WSH','WAS'],['LA','LAR'],['STL','LAR'],['OAK','LV'],['SD','LAC']]) assert.equal(logo('nfl', alias), logo('nfl', team))
  assert.equal(logo('nfl', 'Jacksonville Jaguars'), logo('nfl', 'JAX'))
  assert.match(background('NFL', 'BAL'), /#241773/)
  assert.match(background('nfl', 'JAX'), /#006778/)
  assert.doesNotMatch(background('nfl', 'BAL'), /#DF4601/i)
})

test('an NFL avatar corrects a stale Orioles URL and supplies a missing Jaguars badge', () => {
  const ravens = render(PlayerAvatar, { sport:'NFL',teamAbbr:'BAL',name:'Zay Flowers',headshot:'https://example.test/zay.png',teamLogo:logo('mlb','BAL') })
  assert.match(ravens, /\/nfl\/500\/bal\.png/)
  assert.match(ravens, /#241773/)
  assert.doesNotMatch(ravens, /mlbstatic|#DF4601/i)
  const jaguars = render(PlayerAvatar, { sport:'NFL',teamAbbr:'JAX',name:'Travis Hunter',headshot:'https://example.test/hunter.png' })
  assert.match(jaguars, /\/nfl\/500\/jax\.png/)
  assert.match(jaguars, /#006778/)
  assert.match(render(PlayerAvatar, {sport:'NBA',teamAbbr:'ATL',name:'Player'}), /\/nba\/500\/atl\.png/)
  assert.match(render(PlayerAvatar, {teamAbbr:'BAL',name:'Legacy baseball'}), /mlbstatic/)
})

const post = (pick_data: Record<string, unknown>, sport = 'NFL') => ({
  post: { id:'fixture',author_id:'member',author:{username:'fixture',display_name:'Member'},sport,pick_data,content:'Saved pick',created_at:'2026-11-05T00:00:00Z',visibility:'public',post_type:'pick',bookmark_count:0,repost_count:0,comment_count:0,attachments:[] },
})
test('the actual post renderer fixes every Baltimore/Jacksonville parlay leg in the reported incident', () => {
  const legs = ['Zay Flowers','Rashod Bateman','Mark Andrews','Derrick Henry','Travis Hunter','Parker Washington','Brenton Strange','Trevor Lawrence'].map((player_name, i) => ({player_name,team:i<4?'BAL':'JAX',headshot_url:`https://example.test/${i}.png`,odds:100,prop_label:'2+ Receptions'}))
  const html = render(PostCardClient, post({legs,result:'loss',combined_odds:19553}))
  assert.equal((html.match(/\/nfl\/500\/bal\.png/g) ?? []).length, 8)
  assert.equal((html.match(/\/nfl\/500\/jax\.png/g) ?? []).length, 8)
  assert.doesNotMatch(html, /mlbstatic|#DF4601/i)
})

test('straight picks and mixed parlays use each saved league without rewriting pick data', () => {
  const straight = {player_id:'gsis:1',player_name:'Football Player',team:'BAL',headshot_url:'https://example.test/1.png',odds:125,prop_label:'40+ Receiving Yards'}
  const before = JSON.stringify(straight)
  assert.match(render(PostCardClient, post(straight)), /\/nfl\/500\/bal\.png/)
  assert.equal(JSON.stringify(straight), before)
  const html = render(PostCardClient, post({legs:[{...straight,sport:'MLB'},{...straight,sport:'NBA',team:'ATL'},straight]}))
  assert.match(html, /mlbstatic/)
  assert.match(html, /\/nba\/500\/atl\.png/)
  assert.match(html, /\/nfl\/500\/bal\.png/)
})

test('the actual generated post image uses NFL logos for parlay and straight-player picks', async () => {
  const fixture = { post: post({legs:[{player_name:'Zay Flowers',team:'BAL',odds:125},{player_name:'Travis Hunter',team:'JAX',odds:174}]}).post, image: null as unknown }
  Object.assign(globalThis, { artworkShareFixture: fixture })
  const routeStubs = {
    'next/og': 'export class ImageResponse extends Response {constructor(element){globalThis.artworkShareFixture.image=element;super("fixture")}}',
    '@/lib/supabase/server': 'export const createClient=async()=>({from(){const q={select:()=>q,eq:()=>q,single:async()=>({data:globalThis.artworkShareFixture.post})};return q}})',
    '@/lib/mlbViewerAccess': 'export const canViewMlb=async()=>true',
  }
  const result = await build({
    stdin: { contents:'export {GET} from "./src/app/api/share-image/[postId]/route"',resolveDir:resolve('.'),loader:'tsx' },
    bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react'],tsconfig:'tsconfig.json',
    plugins:[{name:'share-artwork',setup(builder){
      builder.onResolve({filter:/^@slipsurge\/core\//},args=>({path:resolve('packages/core/src',args.path.replace('@slipsurge/core/','')+'.ts')}))
      builder.onResolve({filter:/.*/},args=>args.path in routeStubs?{path:args.path,namespace:'stub'}:undefined)
      builder.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:routeStubs[args.path as keyof typeof routeStubs],loader:'tsx'}))
    }}],
  })
  const loaded={exports:{} as {GET:(request:Request,context:unknown)=>Promise<Response>}}
  new Function('require','module','exports',result.outputFiles[0].text)(require,loaded,loaded.exports)
  const request=()=>loaded.exports.GET(new Request('https://www.slipsurge.com/api/share-image/11111111-1111-4111-8111-111111111111'),{params:Promise.resolve({postId:'11111111-1111-4111-8111-111111111111'})})
  assert.equal((await request()).status,200)
  let html=renderToStaticMarkup(fixture.image as Parameters<typeof renderToStaticMarkup>[0])
  assert.match(html,/\/nfl\/500\/bal\.png/);assert.match(html,/\/nfl\/500\/jax\.png/);assert.doesNotMatch(html,/mlbstatic/)
  fixture.post=post({player_id:'gsis:1',player_name:'Travis Hunter',team:'JAX',odds:174}).post
  assert.equal((await request()).status,200)
  html=renderToStaticMarkup(fixture.image as Parameters<typeof renderToStaticMarkup>[0])
  assert.match(html,/Travis Hunter/);assert.match(html,/\/nfl\/500\/jax\.png/)
})

test('a reused avatar recovers its portrait and badge after another image failed', async () => {
  const { JSDOM } = require('jsdom')
  const dom = new JSDOM('<!doctype html><div id="root"></div>',{url:'https://www.slipsurge.com'})
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})
  const { createRoot } = await import('react-dom/client')
  const host=document.getElementById('root')!,root=createRoot(host)
  try {
    await act(async()=>root.render(createElement(PlayerAvatar,{sport:'nfl',teamAbbr:'BAL',name:'Zay',headshot:'https://example.test/failed.png'})))
    await act(async()=>{for(const image of host.querySelectorAll('img')) image.dispatchEvent(new dom.window.Event('error'))})
    assert.equal(host.querySelectorAll('img').length,0)
    await act(async()=>root.render(createElement(PlayerAvatar,{sport:'nfl',teamAbbr:'JAX',name:'Travis',headshot:'https://example.test/new.png'})))
    assert.equal(host.querySelectorAll('img').length,2)
    assert.ok([...host.querySelectorAll('img')].some(image=>image.src.endsWith('/nfl/500/jax.png')))
    assert.ok([...host.querySelectorAll('img')].some(image=>image.src.endsWith('/new.png')))
  } finally {await act(async()=>root.unmount());dom.window.close()}
})
