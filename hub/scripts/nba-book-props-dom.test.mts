import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import type { PaintGame, PaintRoster } from '../src/lib/nbaPaint.ts'
import * as quotes from '../src/lib/scrapers/nbaBookPropQuotes.ts'
import { nbaBookObservation, nbaSameBookIdentity } from '../src/lib/scrapers/nbaFirstBookQuotes.ts'

const { JSDOM } = createRequire(import.meta.url)('jsdom')
const now = Date.parse('2026-10-24T11:27:00Z')
const game: PaintGame = { id: 21717947, date: '2026-10-24', datetime: '2026-10-24T23:30:00Z', status: 'Scheduled', status_state: 'scheduled', period: 0, season: 2026, home_team_score: 0, visitor_team_score: 0,
  home_team: { id: 6, name: 'Cavaliers', full_name: 'Cleveland Cavaliers', abbreviation: 'CLE' }, visitor_team: { id: 3, name: 'Nets', full_name: 'Brooklyn Nets', abbreviation: 'BKN' } }
const porter: PaintRoster = { id: 375, first_name: 'Michael', last_name: 'Porter Jr.', team: game.visitor_team, position: 'F' }
const sharpe: PaintRoster = { id: 17896038, first_name: 'Day\u2019Ron', last_name: 'Sharpe', team: game.visitor_team, position: 'C' }
const allen: PaintRoster = { id: 9, first_name: 'Jarrett', last_name: 'Allen', team: game.home_team, position: 'C' }
const watson: PaintRoster = { id: 38017721, first_name: 'Peyton', last_name: 'Watson', team: game.home_team, position: 'F' }
const input = { game, roster: [porter, sharpe, allen, watson] }
const metadata = { away: 'Nets', home: 'Cavaliers', dateLabel: 'Today', timeLabel: '4:30 PM', timeZone: 'America/Los_Angeles' }
const row = (name = 'Michael Porter Jr.', odds = '+400', side = 'Yes', unavailable = false) => ({ name, side, odds, unavailable })
const board = (changes: Partial<quotes.NbaBookPropBoard> = {}): quotes.NbaBookPropBoard => ({ ...metadata, title: 'Player points', target: '30+', selectedTarget: '30+', observedAt: new Date(now).toISOString(), expanded: true, transitioned: true, rows: [row()], ...changes })

test('direct regular Ron Holland aliases keep exact milestones and reject off-roster or ambiguous identities',()=>{
  const holland={...porter,id:1028026508,first_name:'Ronald',last_name:'Holland II'}
  for(const name of ['Ron Holland','Ron Holland II']){
    const value=board({target:'10+',selectedTarget:'10+',rows:[row(name,'+250')]})
    const result=quotes.nbaNormalizeBookProp({game,roster:[holland]},value,now)!
    assert.equal(result.complete,true);assert.equal(result.unmatched,0)
    assert.equal(result.props[0].player_id,holland.id);assert.equal(result.props[0].line_value,'10')
    assert.deepEqual(result.props[0].market,{type:'milestone',odds:250});assert.equal(result.props[0].updated_at,value.observedAt)
    for(const roster of [[],[{...holland,id:999}],[{...holland,first_name:'Other'}],[{...holland,team:{...game.home_team,id:999}}],[holland,{...holland,id:999,first_name:'Ron'}]]){
      const rejected=quotes.nbaNormalizeBookProp({game,roster},value,now)!
      assert.deepEqual(rejected.props,[]);assert.equal(rejected.unmatched,1);assert.equal(rejected.complete,false)
    }
  }
})

test('posted 30+ +400 stays an exact milestone; O/U and fractional targets are not relabeled', () => {
  const result = quotes.nbaNormalizeBookProp(input, board(), now)!
  assert.equal(result.complete, true); assert.equal(result.contractKey, 'points:milestone:30')
  assert.equal(result.props[0].line_value, '30'); assert.deepEqual(result.props[0].market, { type: 'milestone', odds: 400 })
  assert.equal(result.props[0].player_id, 375); assert.equal(result.props[0].vendor, 'betmgm')
  assert.ok(result.props[0].id <= -5_000_000_000_000); assert.equal(result.props[0].updated_at, board().observedAt); assert.equal(result.props[0].opening, undefined)
  assert.equal(quotes.nbaBookPropContract('Player points O/U', '30+'), null)
  for (const target of ['29.5+', 'Over 29.5', '0+', '201+']) assert.equal(quotes.nbaBookPropContract('Player points', target), null)
  assert.equal(quotes.nbaBookPropContract('Player double-double', '1+'), null)
})

test('binary Yes/No contracts preserve their actual 0.5 sides and never invent a locked No price', () => {
  for (const title of ['Player double-double', 'Player triple-double']) {
    const full = quotes.nbaNormalizeBookProp(input, board({ title, target: '0.5', selectedTarget: '0.5', rows: [row(undefined, '+250'), row(undefined, '-350', 'No')] }), now)!
    assert.equal(full.complete, true); assert.equal(full.props[0].line_value, '0.5'); assert.deepEqual(full.props[0].market, { type: 'over_under', over_odds: 250, under_odds: -350 })
    const locked = quotes.nbaNormalizeBookProp(input, board({ title, target: '0.5', selectedTarget: '0.5', rows: [row(undefined, '+875'), row(undefined, '', '', true)] }), now)!
    assert.equal(locked.complete, true); assert.deepEqual(locked.props[0].market, { type: 'over_under', over_odds: 875 })
  }
})

test('observed blocks O 0.5/U 0.5 remains an ordinary exact line with both actual prices', () => {
  const result = quotes.nbaNormalizeBookProp(input, board({ title:'Player blocks',target:'O/U 0.5',selectedTarget:'O/U 0.5',rows:[row('Peyton Watson','-190','Over'),row('Peyton Watson','+140','Under')] }), now)!
  assert.equal(result.complete,true); assert.equal(result.contractKey,'blocks:over_under:0.5')
  assert.equal(result.props[0].line_value,'0.5'); assert.equal(result.props[0].player_id,watson.id)
  assert.deepEqual(result.props[0].market,{type:'over_under',over_odds:-190,under_odds:140})
  assert.equal(quotes.nbaBookPropContract('Player points','O/U 0.5'),null)
  assert.equal(quotes.nbaBookPropContract('Player blocks','O/U 1'),null)
  assert.equal(quotes.nbaBookPropContract('Player blocks','O/U -0.5'),null)
})

test('only explicit locked observed rows can produce a complete empty threshold', () => {
  const locked = quotes.nbaNormalizeBookProp(input, board({ rows: [row(undefined, '', '', true)] }), now)!
  assert.equal(locked.status, 'captured'); assert.equal(locked.complete, true); assert.deepEqual(locked.props, [])
  for (const changes of [{ rows: [] }, { rows: [row(undefined, '', '')] }, { expanded: false }, { transitioned: false }, { selectedTarget: '25+' }]) {
    assert.equal(quotes.nbaNormalizeBookProp(input, board(changes), now)!.complete, false)
  }
  const malformed = quotes.nbaNormalizeBookProp(input, board({ rows: [row(), row('Unknown Player', '+500')] }), now)!
  assert.equal(malformed.complete, false); assert.equal(malformed.unmatched, 1); assert.equal(malformed.props.length, 1)
})

test('ambiguous players, conflicting prices, reversed teams and a crossed tip cannot create valid prices', () => {
  const ambiguous = quotes.nbaNormalizeBookProp({ game, roster: [porter, { ...porter, id: 999 }] }, board(), now)!
  assert.deepEqual(ambiguous.props, []); assert.equal(ambiguous.unmatched, 1)
  const conflict = quotes.nbaNormalizeBookProp(input, board({ rows: [row(), row(undefined, '+450')] }), now)!
  assert.deepEqual(conflict.props, []); assert.equal(conflict.complete, false)
  for (const changes of [{ away: metadata.home, home: metadata.away }, { dateLabel: 'Tomorrow' }]) assert.equal(quotes.nbaNormalizeBookProp(input, board(changes), now)!.status, 'identity-mismatch')
  const tip = Date.parse(game.datetime!)
  assert.equal(quotes.nbaNormalizeBookProp(input, board({ observedAt: new Date(tip).toISOString() }), tip)!.status, 'closed')
})

const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function fixture(html: string,runtime?:{clock:typeof Date;timer:(callback:()=>void,ms:number)=>unknown}) {
  const dom = new JSDOM(html), target = { exports: {} }
  new Function('module', 'exports', 'document', 'getComputedStyle','Date','setTimeout', compile('../src/lib/scrapers/nbaBookPropDom.ts'))(target, target.exports, dom.window.document, dom.window.getComputedStyle.bind(dom.window),runtime?.clock??Date,runtime?.timer??setTimeout)
  return { dom, readers: target.exports as typeof import('../src/lib/scrapers/nbaBookPropDom.ts') }
}
const option = (name: string, price: string, id = 'selection', locked = false) => locked ? '<ms-option><div class="option-indicator offline"><span class="lock option-group-lock-icon"></span></div></ms-option>' : `<ms-option><div data-test-option-id="${id}"><div class="name">${name}</div><div class="option-value"><ms-font-resizer>${price}</ms-font-resizer></div></div></ms-option>`
const milestone = (name: string, price: string, id = 'selection', locked = false) => `<div class="attribute-key player-statistics"><div class="group-title"><span class="title">${name}</span></div></div>${option('Yes', price, id, locked)}`
const ordinary = (name: string, line: string, over: string, under: string) => `<div class="attribute-key player-statistics"><div class="group-title"><span class="title">${name}</span></div></div>${option(`O ${line}`,over,`${name}-over-${line}`)}${option(`U ${line}`,under,`${name}-under-${line}`)}`
const panel = (rows: string, tail = '') => `<div id="points" aria-hidden="false"><button role="tab" aria-selected="true">30+</button><button role="tab" aria-selected="true">All</button><div class="player-milestone-container">${rows}</div>${tail}</div>`

test('milestone DOM pairs immediate siblings, recognizes explicit lock and scopes selected target/All/Show More', () => {
  const f = fixture(panel(milestone('Michael Porter Jr.', '+400') + milestone('Sam Merrill', '', 'locked', true), '<div class="show-more-less-button"><span>Show More</span></div>') + `<div hidden>${panel(milestone('Wrong Player', '+999'))}</div>`)
  try {
    const value = f.readers.readMgmPropPanel('points')
    assert.deepEqual(value.rows, [row(), row('Sam Merrill', '', '', true)]); assert.equal(value.expanded, false); assert.equal(value.allSelected, true); assert.equal(value.selectedTarget, '30+')
    f.dom.window.document.querySelector('#points [role="tab"]')!.setAttribute('aria-selected', 'false')
    assert.equal(f.readers.readMgmPropPanel('points').selectedTarget, '')
    f.dom.window.document.querySelector('#points')!.setAttribute('aria-hidden', 'true')
    assert.deepEqual(f.readers.readMgmPropPanel('points').rows, [])
  } finally { f.dom.window.close() }
})

test('binary DOM uses observed Yes/No columns, including the real empty offline No element', () => {
  const f = fixture(`<div id="binary" aria-hidden="false"><div class="yes-no-container"><div class="option-group-header"><span></span><span>Yes</span><span>No</span></div><div class="yes-no-option-row-container"><div class="attribute-key"><span class="attribute-key-ellipsis">Michael Porter Jr.</span></div>${option('Yes', '+875')}<div class="option option-pick empty-option"><div class="offline option-indicator"><span class="lock option-group-lock-icon"></span></div></div></div></div></div>`)
  try {
    const value = f.readers.readMgmPropPanel('binary')
    assert.equal(value.selectedTarget, '0.5'); assert.equal(value.expanded, true); assert.deepEqual(value.rows, [row(undefined, '+875'), row(undefined, '', '', true)])
    f.dom.window.document.querySelector('.lock')!.remove()
    assert.equal(f.readers.readMgmPropPanel('binary').rows[1].unavailable, false)
    f.dom.window.document.querySelector('.empty-option')!.remove()
    const malformed = f.readers.readMgmPropPanel('binary')
    assert.ok(malformed.rows.some(value => !value.unavailable && !value.odds))
  } finally { f.dom.window.close() }
})

test('reversed No/Yes headings preserve actual column sides and a locked No never becomes a price', () => {
  const locked = '<div class="option option-pick empty-option"><div class="offline option-indicator"><span class="lock option-group-lock-icon"></span></div></div>'
  for (const no of [locked, option('No', '-550', 'no')]) {
    const f = fixture(`<div id="binary" aria-hidden="false"><div class="yes-no-container"><div class="option-group-header"><span></span><span>No</span><span>Yes</span></div><div class="yes-no-option-row-container"><div class="attribute-key"><span class="attribute-key-ellipsis">Michael Porter Jr.</span></div>${no}${option('Yes', '+415', 'yes')}</div></div></div>`)
    try {
      const value = f.readers.readMgmPropPanel('binary')
      assert.deepEqual(value.targets, ['0.5']); assert.equal(value.selectedTarget, '0.5')
      assert.deepEqual(value.rows, [no === locked ? row(undefined, '', '', true) : row(undefined, '-550', 'No'), row(undefined, '+415', 'Yes')])
      for (const title of ['Player double-double', 'Player triple-double']) {
        const result: quotes.NbaBookPropCapture = quotes.nbaNormalizeBookProp(input, board({ title, target: '0.5', selectedTarget: value.selectedTarget, expanded: value.expanded, rows: value.rows }), now)!
        assert.equal(result.complete, true); assert.equal(result.unmatched, 0)
        assert.deepEqual(result.props[0].market, { type: 'over_under', ...(no === locked ? {} : { under_odds: -550 }), over_odds: 415 })
        assert.equal(result.props[0].updated_at, board().observedAt)
      }
    } finally { f.dom.window.close() }
  }
})

test('binary heading order support still rejects duplicate, unknown or mismatched columns', () => {
  const html = (headings: string[], outcomes: string) => `<div id="binary" aria-hidden="false"><div class="yes-no-container"><div class="option-group-header"><span></span>${headings.map(heading => `<span>${heading}</span>`).join('')}</div><div class="yes-no-option-row-container"><div class="attribute-key"><span class="attribute-key-ellipsis">Michael Porter Jr.</span></div>${outcomes}</div></div></div>`
  for (const headings of [['Yes', 'Yes'], ['No', 'No'], ['No', 'Yes', 'Yes'], ['Over', 'Under'], ['No']]) {
    const f = fixture(html(headings, option('No', '-550') + option('Yes', '+415')))
    try { assert.deepEqual(f.readers.readMgmPropPanel('binary').targets, [], headings.join(',')) }
    finally { f.dom.window.close() }
  }
  const f = fixture(html(['No', 'Yes'], option('Yes', '+415') + option('No', '-550')))
  try {
    const value = f.readers.readMgmPropPanel('binary')
    const result = quotes.nbaNormalizeBookProp(input, board({ title: 'Player double-double', target: '0.5', selectedTarget: value.selectedTarget, expanded: value.expanded, rows: value.rows }), now)!
    assert.equal(result.complete, false); assert.equal(result.unmatched, 2); assert.deepEqual(result.props, [])
  } finally { f.dom.window.close() }
})

test('ordinary O/U accepts an explicitly locked known line, while blank prices or unknown locked lines remain incomplete', () => {
  const html = `<div id="blocks" aria-hidden="false"><ms-player-milestone-over-under-option-group><div class="option-group-header"><span>Over</span><span>Under</span></div>${ordinary('Peyton Watson','0.5','-190','')}</ms-player-milestone-over-under-option-group></div>`
  const f = fixture(html)
  try {
    const normalize = () => {
      const value = f.readers.readMgmPropPanel('blocks')
      return quotes.nbaNormalizeBookProp(input, board({title:'Player blocks',target:'O/U 0.5',selectedTarget:value.selectedTarget,expanded:value.expanded,rows:value.rows}),now)!
    }
    assert.equal(normalize().complete,false)
    const under = f.dom.window.document.querySelectorAll('ms-option')[1]
    under.insertAdjacentHTML('beforeend','<div class="option-indicator offline"><span class="lock option-group-lock-icon"></span></div>')
    const known = normalize()
    assert.equal(known.complete,true); assert.equal(known.unmatched,0)
    assert.deepEqual(known.props[0].market,{type:'over_under',over_odds:-190})
    under.querySelector('.name')!.textContent=''
    assert.equal(normalize().complete,false)
    const unknown = f.readers.readMgmPropPanel('blocks')
    assert.equal('targetsComplete' in unknown && unknown.targetsComplete,false)
  } finally { f.dom.window.close() }
})

async function navigation(options: { countdown?:boolean; countdownOffsetMinutes?:number; stalled?: boolean; flash?: boolean; failedMenu?: boolean; unposted?: boolean; loading?: boolean; unselected?: boolean; blocks?:boolean; adaptive?:boolean; hardBudget?:number;roundTrip?:number;failedClick?:boolean;liveChange?:boolean;retryFailure?:'once'|'repeat'|'stale-selected'|'global-deadline'|'target-deadline'|'identity';normalizationThrow?:boolean;slowIdentity?:'retry'|'final' } = {}) {
  const prices: Record<string, string> = { '10+': '-2500', '15+': '-550', '20+': '-175', '25+': '+155', '30+': '+400', '35+': '+950', '40+': '+1850' }
  let clock = now, selected = '10+', displayed = '10+', all = false, allRows = false, expanded = false, expandedRows = false, empty = false
  let evaluations=0,remoteWaits=0,uiErrors=0,identityDelayed=false
  const normalized:{target:string;observedAt:string;countdownAt?:string}[]=[]
  class Clock extends Date { constructor(value: string | number = clock) { super(value) } static now() { return clock } }
  const pending: { at: number; apply: () => void }[] = [], clicked: string[] = []
  const render = () => {
    const tabs = Object.keys(prices).map(value => `<button role="tab" aria-selected="${value === selected}">${value}</button>`).join('')
    const rows = empty ? '' : milestone('Michael Porter Jr.', prices[displayed], `porter-${displayed}`) + (allRows ? milestone('Day\u2019Ron Sharpe', '+5000', `sharpe-${displayed}`) : '') + (expandedRows ? milestone('Jarrett Allen', '+8000', `allen-${displayed}`) : '')
    const header = options.failedMenu ? '' : `<button aria-controls="points" aria-expanded="true"><span slot="title">${options.unposted ? 'First field goal scorer' : options.blocks ? 'Player blocks' : 'Player points'}</span></button>`
    const content = options.blocks ? `<ms-player-milestone-over-under-option-group><div class="player-milestone-container"><div class="option-group-header"><span>Over</span><span>Under</span></div>${ordinary('Peyton Watson','0.5','-190','+140')}${expandedRows ? ordinary('Jarrett Allen','1.5','+250','-350') : ''}</div></ms-player-milestone-over-under-option-group>` : `${tabs}<button role="tab" aria-selected="${all}">All</button><div class="player-milestone-container">${rows}</div>`
    f.dom.window.document.body.innerHTML = `<button data-menu-item-id="-1" class="ds-pill-current ${options.unselected ? '' : 'ds-pill-selected'}" aria-disabled="false">All</button>${options.loading ? '<div role="progressbar"></div>' : ''}${header}<div id="points" aria-hidden="false">${content}<div class="show-more-less-button">${expanded ? 'Show Less' : 'Show More'}</div></div>`
  }
  const advance=(ms:number)=>{
    clock+=ms
    for(let index=0;index<pending.length;){if(pending[index].at<=clock)pending.splice(index,1)[0].apply();else index++}
    render()
  }
  const f=fixture('',{clock:Clock as typeof Date,timer:(callback,ms)=>{advance(ms);queueMicrotask(callback)}})
  render()
  const locator = (kind: string, name = '') => ({
    first() { return this }, count: async () => 1, waitFor: async () => {}, isVisible: async () => !expanded,
    getAttribute: async () => 'true',
    getByRole: (_role: string, value: { name: string }) => locator('tab', value.name), getByText: () => locator('more'),
    click: async () => {
      advance(options.roundTrip??0)
      clicked.push(kind === 'more' ? 'more' : name)
      if (kind === 'more') { expanded = true; pending.push({ at: clock + 500, apply: () => { expandedRows = true } }) }
      else if (name === 'All') { all = true; pending.push({ at: clock + 500, apply: () => { allRows = true } }) }
      else if (kind === 'tab') {
        if(name==='15+'&&options.retryFailure&&(uiErrors===0||options.retryFailure==='repeat')){
          uiErrors++
          if(options.retryFailure==='stale-selected'){selected=name;render()}
          if(options.retryFailure==='global-deadline')advance(60_000)
          if(options.retryFailure==='target-deadline')advance(6501)
          throw new Error('private transient browser operation')
        }
        selected = name
        if(options.failedClick&&name==='15+'){displayed=name;render();throw new Error('Navigation command failed after rendering target')}
        if (name === '30+' && (options.stalled || options.flash)) {
          if (options.flash) { pending.push({ at: clock + 125, apply: () => { empty = true } }, { at: clock + 250, apply: () => { empty = false } }) }
        } else pending.push({ at: clock + 500, apply: () => { displayed = name } })
      }
      render()
    },
  })
  const captureInput = options.countdown ? { ...input, game: { ...game, datetime: new Date(now + 22 * 60_000 + 500).toISOString() } } : input
  const identityReader = () => {
    if(!identityDelayed&&(options.slowIdentity==='retry'&&uiErrors>0||options.slowIdentity==='final'&&selected==='15+'&&displayed==='15+')){identityDelayed=true;advance(6501)}
    if(options.retryFailure==='identity'&&uiErrors>0)return{...metadata,away:'Different team'}
    if(options.liveChange&&displayed==='15+'){prices['15+']='-600';render()}
    return options.countdown ? { ...metadata, dateLabel: '', timeLabel: '', countdown: { minutes: Math.floor((Date.parse(captureInput.game.datetime!) + (options.countdownOffsetMinutes ?? 0) * 60_000 - clock) / 60_000), observedAt: new Date(clock).toISOString() } } : metadata
  }
  const page = {
    evaluate: async (fn: (arg?: unknown) => unknown, arg?: unknown) => {evaluations++;advance(options.roundTrip??0);return fn(arg)},
    locator: () => locator('panel'),
    waitForTimeout: async (ms: number) => {
      remoteWaits++;advance(ms+(options.roundTrip??0))
    },
  }
  const imports: Record<string, unknown> = {
    './nbaFirstBookDom': { readMgmFirstIdentity: identityReader }, './nbaBookPropDom': f.readers,
    './nbaFirstBookQuotes': { nbaSameBookIdentity, nbaBookObservation: (...args: Parameters<typeof nbaBookObservation>) => nbaBookObservation(args[0], args[1], clock) },
    './nbaBookPropQuotes': { ...quotes, nbaNormalizeBookProp: (...args: Parameters<typeof quotes.nbaNormalizeBookProp>) => {
      normalized.push({target:args[1].target,observedAt:args[1].observedAt,countdownAt:args[1].countdown?.observedAt})
      if(options.normalizationThrow&&args[1].target==='15+')throw new Error('private normalization failure')
      return quotes.nbaNormalizeBookProp(args[0], args[1], clock)
    } },
  }
  const target = { exports: {} }
  new Function('require', 'module', 'exports', 'Date', compile('../src/lib/scrapers/nbaMgmProps.ts'))((name: string) => { assert.ok(name in imports, name); return imports[name] }, target, target.exports, Clock)
  const collector = target.exports as typeof import('../src/lib/scrapers/nbaMgmProps.ts')
  const deadline = options.adaptive ? () => clock >= now + 3000 ? now + 60_000 : now + 3500 : now + (options.hardBudget ?? 60_000)
  try { return { ...(await collector.collectMgmProps(page as never, captureInput, deadline)), clicked,evaluations,remoteWaits,elapsed:clock-now,uiErrors,normalized } } finally { f.dom.window.close() }
}

test('all seven posted thresholds wait for delayed actual rows, scoped All and Show More before saving', async () => {
  const result = await navigation()
  assert.equal(result.frames.length, 7); assert.ok(result.frames.every(frame => frame.complete && frame.props.length === 3))
  assert.deepEqual(result.frames.map(frame => frame.contractKey), [10, 15, 20, 25, 30, 35, 40].map(value => `points:milestone:${value}`))
  assert.equal(result.frames.find(frame => frame.contractKey === 'points:milestone:30')!.props.find(prop => prop.player_id === 375)!.market.odds, 400)
  assert.equal(result.frames.find(frame => frame.contractKey === 'points:milestone:25')!.props.find(prop => prop.player_id === 375)!.market.odds, 155)
  assert.deepEqual(result.clicked.slice(0, 2), ['All', 'more']); assert.ok(result.coverage.every(scope => scope.complete))
})

test('regular ladders survive a normal countdown minute decrement using each fresh identity read', async () => {
  const result = await navigation({ countdown: true })
  assert.equal(result.frames.length, 7); assert.ok(result.frames.every(frame => frame.complete)); assert.ok(result.coverage.every(scope => scope.complete))
  assert.ok(result.normalized.every(value => value.countdownAt && Date.parse(value.countdownAt) > now))
  assert.ok(result.normalized.every(value => value.observedAt === value.countdownAt), 'prices use the fresh identity time, never an old countdown with a new clock')
})

test('a later same-date source countdown preserves all exact regular thresholds and actual read timestamps', async () => {
  const result = await navigation({ countdown: true, countdownOffsetMinutes: 10 })
  assert.equal(result.frames.length, 7); assert.ok(result.frames.every(frame => frame.complete)); assert.ok(result.coverage.every(scope => scope.complete))
  assert.deepEqual(result.frames.map(frame => frame.contractKey), [10, 15, 20, 25, 30, 35, 40].map(value => `points:milestone:${value}`))
  assert.equal(result.frames.find(frame => frame.contractKey === 'points:milestone:30')!.props.find(prop => prop.player_id === 375)!.market.odds, 400)
  assert.ok(result.normalized.every(value => value.countdownAt && value.observedAt === value.countdownAt))
})

test('a selected tab with old rows, including empty-loading then old rows, never relabels the prior price', async () => {
  for (const options of [{ stalled: true }, { flash: true }]) {
    const result = await navigation(options), thirty = result.frames.find(frame => frame.contractKey === 'points:milestone:30')!
    assert.equal(thirty.complete, false); assert.deepEqual(thirty.props, []); assert.equal(thirty.status, 'partial')
    assert.equal(result.frames.find(frame => frame.contractKey === 'points:milestone:35')!.props.find(prop => prop.player_id === 375)!.market.odds, 950)
  }
})

test('a command failure after a rendered transition can recover verified rows without relabeling the next target',async()=>{
  const result=await navigation({failedClick:true})
  const failed=result.frames.find(frame=>frame.contractKey==='points:milestone:15')!
  assert.equal(failed.complete,true);assert.equal(failed.props.find(prop=>prop.player_id===375)!.market.odds,-550)
  assert.equal(result.clicked.filter(target=>target==='15+').length,1,'a settled matching target need not be clicked again')
  const next=result.frames.find(frame=>frame.contractKey==='points:milestone:20')!
  assert.equal(next.complete,true);assert.equal(next.props.find(prop=>prop.player_id===375)!.market.odds,-175)
  assert.notEqual(next.props.find(prop=>prop.player_id===375)!.market.odds,-550,'the previously rendered15+ price cannot be relabeled20+')
})

test('one thrown target operation retries with fresh identity and baseline without restamping previously observed prices',async()=>{
  const baseline=await navigation(),result=await navigation({retryFailure:'once'})
  const recovered=result.frames.find(frame=>frame.contractKey==='points:milestone:15')!
  assert.equal(result.uiErrors,1);assert.equal(result.clicked.filter(target=>target==='15+').length,2)
  assert.equal(recovered.complete,true);assert.equal(recovered.props.find(prop=>prop.player_id===375)!.market.odds,-550)
  assert.equal(result.frames[0].observedAt,baseline.frames[0].observedAt)
  assert.ok(result.frames.filter(frame=>frame.complete).every(frame=>frame.props.every(prop=>prop.updated_at===frame.observedAt)))
  assert.equal(result.normalized.filter(frame=>frame.target==='15+').length,1)
})

test('a repeated target error stops after one retry and leaves its valid siblings unchanged',async()=>{
  const result=await navigation({retryFailure:'repeat'}),failed=result.frames.find(frame=>frame.contractKey==='points:milestone:15')!
  assert.equal(result.uiErrors,2);assert.equal(result.clicked.filter(target=>target==='15+').length,2)
  assert.equal(failed.status,'error');assert.deepEqual(failed.props,[])
  assert.equal(result.normalized.filter(frame=>frame.target==='15+').length,0)
  assert.equal(result.frames.find(frame=>frame.contractKey==='points:milestone:20')!.props.find(prop=>prop.player_id===375)!.market.odds,-175)
  assert.equal(JSON.stringify(result).includes('private'),false)
})

test('a click throwing after selection cannot make its still-old rows valid on retry',async()=>{
  const result=await navigation({retryFailure:'stale-selected'}),failed=result.frames.find(frame=>frame.contractKey==='points:milestone:15')!
  assert.equal(failed.complete,false);assert.equal(failed.status,'partial');assert.deepEqual(failed.props,[])
  assert.equal(result.clicked.filter(target=>target==='15+').length,1)
  assert.equal(result.frames.find(frame=>frame.contractKey==='points:milestone:20')!.props.find(prop=>prop.player_id===375)!.market.odds,-175)
})

test('exhausted global or shared target deadline prevents another extraction attempt',async()=>{
  for(const retryFailure of ['global-deadline','target-deadline'] as const){
    const result=await navigation({retryFailure}),failed=result.frames.find(frame=>frame.contractKey==='points:milestone:15')!
    assert.equal(result.uiErrors,1);assert.equal(result.clicked.filter(target=>target==='15+').length,1)
    assert.equal(failed.status,retryFailure==='global-deadline'?'deadline':'error');assert.deepEqual(failed.props,[])
    assert.equal(result.normalized.filter(frame=>frame.target==='15+').length,0)
  }
})

test('retry refuses a changed event identity and never retries a normalization failure or partial result',async()=>{
  const identity=await navigation({retryFailure:'identity'})
  assert.equal(identity.clicked.filter(target=>target==='15+').length,1)
  assert.ok(identity.frames.every(frame=>!frame.complete&&frame.props.length===0))
  const malformed=await navigation({normalizationThrow:true})
  assert.equal(malformed.normalized.filter(frame=>frame.target==='15+').length,1)
  assert.equal(malformed.frames.find(frame=>frame.contractKey==='points:milestone:15')!.status,'error')
  const partial=await navigation({stalled:true})
  assert.equal(partial.clicked.filter(target=>target==='30+').length,1)
  assert.equal(partial.normalized.filter(frame=>frame.target==='30+').length,1)
})

test('a slow retry or final identity read cannot accept a price after the shared target cutoff',async()=>{
  for(const options of [{retryFailure:'once' as const,slowIdentity:'retry' as const},{slowIdentity:'final' as const}]){
    const result=await navigation(options),failed=result.frames.find(frame=>frame.contractKey==='points:milestone:15')!
    assert.equal(failed.complete,false);assert.equal(failed.status,'error');assert.deepEqual(failed.props,[])
    assert.equal(result.clicked.filter(target=>target==='15+').length,1)
    assert.equal(result.normalized.filter(frame=>frame.target==='15+').length,0)
  }
})

test('a live update after the prior target capture cannot masquerade as the next target response',async()=>{
  const result=await navigation({liveChange:true})
  const next=result.frames.find(frame=>frame.contractKey==='points:milestone:20')!
  assert.equal(next.complete,true);assert.equal(next.props.find(prop=>prop.player_id===375)!.market.odds,-175)
  assert.notEqual(next.props.find(prop=>prop.player_id===375)!.market.odds,-600)
})

test('an active scan can reclaim its extended budget while a true global cutoff still emits honest deadlines', async () => {
  const adaptive = await navigation({adaptive:true})
  assert.equal(adaptive.frames.length,7); assert.ok(adaptive.frames.every(frame=>frame.complete))
  const bounded = await navigation({hardBudget:3500})
  assert.ok(bounded.frames.some(frame=>frame.status==='deadline'))
  assert.ok(bounded.frames.filter(frame=>frame.complete).every(frame=>Date.parse(frame.observedAt!) < now+3500))
})

test('blocks O/U DOM discovers additional exact lines after Show More without clicking or inventing milestone tabs', async () => {
  const result = await navigation({blocks:true})
  assert.deepEqual(result.frames.map(frame=>frame.contractKey),['blocks:over_under:0.5','blocks:over_under:1.5'])
  assert.ok(result.frames.every(frame=>frame.complete))
  assert.deepEqual(result.frames[0].props[0].market,{type:'over_under',over_odds:-190,under_odds:140})
  assert.deepEqual(result.frames[1].props[0].market,{type:'over_under',over_odds:250,under_odds:-350})
  assert.deepEqual(result.clicked,['more'])
  assert.deepEqual(result.coverage.find(scope=>scope.market==='blocks')!.contracts,['blocks:over_under:0.5','blocks:over_under:1.5'])
})

test('a first-ever failed menu read reports unresolved coverage instead of an empty green result', async () => {
  const result = await navigation({ failedMenu: true })
  assert.deepEqual(result.frames, []); assert.equal(result.coverage.length, Object.keys(quotes.MGM_MILESTONE_PANELS).length)
  assert.ok(result.coverage.every(scope => !scope.complete && scope.contracts.length === 0))
})

test('cloud readiness polls stay within one bounded browser call while retaining actual250ms stable rows',async()=>{
  const result=await navigation({roundTrip:150})
  assert.equal(result.frames.length,7);assert.ok(result.frames.every(frame=>frame.complete&&frame.props.length===3))
  assert.ok(result.evaluations<=33,`remote evaluations=${result.evaluations}`)
  assert.ok(result.remoteWaits<=4,`remote waits=${result.remoteWaits}`)
  assert.ok(result.elapsed<13_000,`cloud-simulated elapsed=${result.elapsed}`)
  assert.equal(result.frames.find(frame=>frame.contractKey==='points:milestone:30')!.props.find(prop=>prop.player_id===375)!.market.odds,400)
})

test('a present supported panel skipped at the absolute deadline is explicitly unresolved',async()=>{
  const result=await navigation({hardBudget:1200})
  const points=result.coverage.find(scope=>scope.market==='points')!
  assert.equal(points.complete,false);assert.equal(points.status,'deadline');assert.deepEqual(result.frames,[])
})

test('only a stable selected All menu with actual event markets can classify player markets as not posted', async () => {
  const unavailable = await navigation({ unposted: true })
  assert.deepEqual(unavailable.frames, [])
  assert.ok(unavailable.coverage.every(scope => scope.status === 'unavailable' && !scope.complete && scope.contracts.length === 0))
  for (const options of [{ unposted: true, loading: true }, { unposted: true, unselected: true }, { failedMenu: true }]) {
    const incomplete = await navigation(options)
    assert.ok(incomplete.coverage.every(scope => !scope.complete && scope.status === undefined))
  }
})

async function familyRerender(mode: 'rotate' | 'delayed' | 'removed' | 'duplicate' | 'loading' | 'unselected' | 'identity', budget = 60_000) {
  let clock = now, changed = false, changedAt = now
  class Clock extends Date { constructor(value: string | number = clock) { super(value) } static now() { return clock } }
  const f = fixture('', { clock: Clock as typeof Date, timer: (callback, ms) => { clock += ms; queueMicrotask(callback) } })
  const render = () => {
    const header = (title: string, id: string) => `<button aria-controls="${id}" aria-expanded="true"><span slot="title">${title}</span></button>`
    const content = (id: string, target: string, price: string) => `<div id="${id}" aria-hidden="false"><button role="tab" aria-selected="true">${target}</button><button role="tab" aria-selected="true">All</button><div class="player-milestone-container">${milestone('Michael Porter Jr.', price, id)}</div></div>`
    const redrawing = changed && mode === 'delayed' && clock < changedAt + 375
    const reboundId = changed && ['rotate', 'delayed'].includes(mode) ? 'rebounds-current' : 'rebounds-initial'
    f.dom.window.document.body.innerHTML = `<button data-menu-item-id="-1" class="ds-pill-current ${changed && mode === 'unselected' ? '' : 'ds-pill-selected'}">All</button>${redrawing || changed && mode === 'loading' ? '<div role="progressbar"></div>' : ''}`
      + header('Player points', 'points') + content('points', '30+', '+400')
      + (redrawing || changed && mode === 'removed' ? '' : header('Player rebounds', reboundId) + content(reboundId, '10+', '+700'))
      + (changed && mode === 'duplicate' ? header('Player rebounds', 'rebounds-duplicate') + content('rebounds-duplicate', '10+', '+900') : '')
  }
  render()
  const seenSelectors: string[] = []
  const locator = (selector: string) => ({
    count: async () => f.dom.window.document.querySelectorAll(selector).length,
    getAttribute: async (name: string) => f.dom.window.document.querySelector(selector)?.getAttribute(name) ?? null,
    waitFor: async () => { assert.ok(f.dom.window.document.querySelector(selector), selector) },
    getByRole: () => ({ click: async () => { assert.fail('already selected target must not be clicked') } }),
    getByText: () => ({ first: () => ({ count: async () => 0, isVisible: async () => false }) }),
    click: async () => { assert.fail('already expanded family must not be clicked') },
  })
  const page = {
    evaluate: async (fn: (arg?: unknown) => unknown, arg?: unknown) => fn(arg),
    locator: (selector: string) => { seenSelectors.push(selector); return locator(selector) },
    waitForTimeout: async (ms: number) => { clock += ms; render() },
  }
  const imports: Record<string, unknown> = {
    './nbaFirstBookDom': { readMgmFirstIdentity: () => changed && mode === 'identity' ? { ...metadata, away: 'Different team' } : metadata },
    './nbaBookPropDom': f.readers,
    './nbaFirstBookQuotes': { nbaSameBookIdentity, nbaBookObservation: (...args: Parameters<typeof nbaBookObservation>) => nbaBookObservation(args[0], args[1], clock) },
    './nbaBookPropQuotes': { ...quotes, nbaNormalizeBookProp: (...args: Parameters<typeof quotes.nbaNormalizeBookProp>) => {
      const frame = quotes.nbaNormalizeBookProp(args[0], args[1], clock)
      if (args[1].title === 'Player points') { changed = true; changedAt = clock; render() }
      return frame
    } },
  }
  const target = { exports: {} }
  new Function('require', 'module', 'exports', 'Date', compile('../src/lib/scrapers/nbaMgmProps.ts'))((name: string) => imports[name], target, target.exports, Clock)
  const collector = target.exports as typeof import('../src/lib/scrapers/nbaMgmProps.ts')
  try { return { ...await collector.collectMgmProps(page as never, input, now + budget), seenSelectors, elapsed: clock - now } }
  finally { f.dom.window.close() }
}

test('each known family reacquires its exact current header when earlier panels replace later panel IDs', async () => {
  for (const mode of ['rotate', 'delayed'] as const) {
    const result = await familyRerender(mode)
    assert.deepEqual(result.frames.map(frame => frame.contractKey), ['points:milestone:30', 'rebounds:milestone:10'])
    assert.ok(result.frames.every(frame => frame.complete))
    assert.equal(result.frames[1].props[0].market.odds, 700)
    assert.ok(result.seenSelectors.includes('button[aria-controls="rebounds-current"]'))
    assert.equal(result.seenSelectors.includes('button[aria-controls="rebounds-initial"]'), false)
    assert.equal(result.coverage.find(scope => scope.market === 'rebounds')!.complete, true)
    assert.ok(result.elapsed < 5000, 'readiness stays within its existing bounded capture window')
  }
})

test('a disappeared, duplicate or unsafe current family cannot become a complete empty withdrawal', async () => {
  for (const mode of ['removed', 'duplicate', 'loading', 'unselected', 'identity'] as const) {
    const result = await familyRerender(mode)
    assert.equal(result.frames.some(frame => frame.market === 'rebounds'), false, mode)
    const coverage = result.coverage.find(scope => scope.market === 'rebounds')!
    assert.equal(coverage.complete, false, mode); assert.deepEqual(coverage.contracts, [], mode)
    if (mode === 'identity') assert.ok(result.frames.every(frame => !frame.complete && !frame.props.length))
    else assert.equal(result.frames[0].complete, true, 'a verified earlier family stays valid')
    assert.ok(result.elapsed <= 3000, 'an unresolved family cannot extend its 1.5-second readiness cap')
  }
  const bounded = await familyRerender('removed', 2300)
  assert.equal(bounded.coverage.find(scope => scope.market === 'rebounds')!.status, 'deadline')
  assert.equal(bounded.frames.some(frame => frame.market === 'rebounds'), false)
  assert.ok(bounded.elapsed <= 2300, 'the original absolute deadline is never extended')
})
