import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'

const require = createRequire(new URL('../package.json', import.meta.url))
const React = require('react')
const { createRoot } = require('react-dom/client')
const ts = require('typescript')
const { act } = React
const sourcePath = process.env.HANDOFF_SOURCE || new URL('../src/components/layout/ContextHandoff.tsx', import.meta.url)
const cloud = new Map()
const writes = []
let nextError = null
let state = { path: '/search', user: { id: 'member-a' }, loading: false }
let pushed = null
const client = {
  from(table) {
    assert.equal(table, 'member_context_handoff')
    let userId
    return {
      select() { return this }, eq(_, id) { userId = id; return this },
      maybeSingle() { return Promise.resolve({ data: cloud.get(userId) || null, error: null }) },
      upsert(row, options) {
        assert.equal(options.onConflict, 'user_id')
        // Faithful to PostgREST: merely constructing this object sends nothing.
        return { then(resolve, reject) {
          return Promise.resolve().then(() => {
            writes.push(row)
            if (nextError) { const error = nextError; nextError = null; return { error } }
            cloud.set(row.user_id, { ...row })
            return { error: null }
          }).then(resolve, reject)
        } }
      },
    }
  },
}
const imports = {
  react: React,
  'next/navigation': { usePathname: () => state.path.split('?')[0], useSearchParams: () => new URLSearchParams(state.path.split('?')[1]), useRouter: () => ({ push: path => { pushed = path } }) },
  '@/context/AuthContext': { useAuth: () => state },
  '@/lib/supabase/client': { createClient: () => client },
  'lucide-react': { ArrowRight: () => null, History: () => null, X: () => null },
}
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const componentModule = { exports: {} }
new Function('require', 'module', 'exports', compiled)(name => imports[name] || require(name), componentModule, componentModule.exports)
const { ContextHandoff } = componentModule.exports

let now = 0, seq = 0, timers = new Map(), window, root, maxScroll = 5000
function schedule(fn, delay, interval = false) { const id = ++seq; timers.set(id, { fn, due: now + delay, delay, interval }); return id }
async function tick(ms) {
  await act(async () => {
    const end = now + ms
    while (true) {
      const next = [...timers].filter(([, t]) => t.due <= end).sort((a,b) => a[1].due-b[1].due)[0]
      if (!next) break
      const [id, t] = next; now = t.due
      if (t.interval) t.due += t.delay; else timers.delete(id)
      t.fn(); await Promise.resolve()
    }
    now = end
  })
}
async function mount(path = '/search', userId = 'member-a') {
  timers.clear(); now = 0; pushed = null
  state = { path, user: userId ? { id: userId } : null, loading: false }
  const dom = new JSDOM('<title>Research | SlipSurge</title><div id="app"></div>', { url: 'https://fixture.slipsurge.test' + path })
  window = dom.window
  Object.assign(globalThis, { window, document: window.document, localStorage: window.localStorage, sessionStorage: window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: window.navigator })
  globalThis.setTimeout = (fn, delay) => schedule(fn, delay)
  globalThis.clearTimeout = id => timers.delete(id)
  globalThis.setInterval = (fn, delay) => schedule(fn, delay, true)
  globalThis.clearInterval = id => timers.delete(id)
  globalThis.requestAnimationFrame = fn => schedule(fn, 16)
  globalThis.cancelAnimationFrame = id => timers.delete(id)
  window.scrollTo = ({ top }) => { window.scrollY = Math.min(top, maxScroll) }
  root = createRoot(window.document.getElementById('app'))
  await render()
}
async function render() { await act(async () => root.render(React.createElement(ContextHandoff))) }
async function unmount() { await act(async () => root.unmount()); window.close(); timers.clear() }

test('starts real lazy save, retries failures, captures later scrolling, reconnects', async () => {
  cloud.clear(); writes.length = 0
  await mount()
  nextError = { code: 'NETWORK' }
  await tick(30_000)
  assert.equal(writes.length, 1, 'save must consume the lazy Supabase request')
  assert.equal(cloud.size, 0)
  window.scrollY = 450
  await tick(30_000)
  assert.equal(cloud.get('member-a').scroll_y, 450)
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
  window.scrollY = 750
  await tick(30_000)
  assert.equal(cloud.get('member-a').scroll_y, 450)
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  await act(async () => window.dispatchEvent(new window.Event('online')))
  assert.equal(cloud.get('member-a').scroll_y, 750)
  await unmount()
})

test('isolated second device resumes cloud path/query/scroll through navigation cleanup', async () => {
  cloud.clear()
  await mount('/search?q=NFL')
  window.scrollY = 1200
  await tick(30_000)
  await unmount()
  await mount('/missions') // A fresh JSDOM has independent local/session storage.
  assert.equal(document.querySelector('aside')?.getAttribute('aria-label'), 'Continue your last session')
  await act(async () => document.querySelector('button').click())
  assert.equal(pushed, '/search?q=NFL')
  state.path = pushed; window.scrollY = 0
  await render()
  await tick(16)
  assert.equal(window.scrollY, 1200, 'outgoing cleanup must not clobber destination scroll')
  await unmount()
})

test('waits for delayed content and lets manual scrolling cancel restoration', async () => {
  cloud.set('member-a', { path: '/feed', page_title: 'Feed', scroll_y: 1800 })
  await mount('/missions')
  await act(async () => document.querySelector('button').click())
  maxScroll = 0; state.path = '/feed'; await render()
  await tick(160)
  maxScroll = 5000; await tick(250)
  assert.equal(window.scrollY, 1800)
  await unmount()
  cloud.set('member-a', { path: '/feed', page_title: 'Feed', scroll_y: 1800 })
  await mount('/missions')
  await act(async () => document.querySelector('button').click())
  maxScroll = 0; state.path = '/feed'; await render(); await tick(16)
  await act(async () => window.dispatchEvent(new window.Event('wheel')))
  maxScroll = 5000; await tick(160)
  assert.equal(window.scrollY, 0)
  await unmount()
})

test('stable account identity does not postpone sync; hidden page flushes', async () => {
  cloud.clear(); writes.length = 0
  await mount()
  await tick(20_000)
  state.user = { id: 'member-a' }; await render()
  await tick(10_000)
  assert.equal(writes.length, 1)
  window.scrollY = 900
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  await act(async () => document.dispatchEvent(new window.Event('visibilitychange')))
  assert.equal(cloud.get('member-a').scroll_y, 900)
  await unmount()
})

test('ignores unsafe remote routes and separates accounts', async () => {
  for (const path of ['//evil.example','/admin/users','/api/private','/auth/login','/feed\n']) {
    cloud.set('member-a', { path, page_title: 'Bad', scroll_y: 1 })
    await mount('/missions'); assert.equal(document.querySelector('aside'), null); await unmount()
  }
  cloud.set('member-a', { path: '/feed', page_title: 'Feed', scroll_y: 200 })
  await mount('/search')
  await act(async () => document.querySelector('button').click())
  state.user = { id: 'member-b' }; state.path = '/feed'; window.scrollY = 0
  await render(); await tick(16)
  assert.equal(window.scrollY, 0, 'another account cannot consume a pending restore')
  assert.equal(document.querySelector('aside'), null)
  await unmount()
})

test('desktop inner scroll position is saved and restored across devices', async () => {
  cloud.clear()
  await mount('/feed')
  const shell = document.createElement('div'); shell.className = 'ss-desktop-shell'
  const main = document.createElement('main'); shell.append(main); document.body.append(shell)
  main.scrollTop = 1600
  await tick(30_000)
  assert.equal(cloud.get('member-a').scroll_y, 1600)
  await unmount()
  await mount('/missions')
  const destShell = document.createElement('div'); destShell.className = 'ss-desktop-shell'
  const destMain = document.createElement('main'); destShell.append(destMain); document.body.append(destShell)
  destMain.scrollTo = ({ top }) => { destMain.scrollTop = top }
  await act(async () => document.querySelector('button').click())
  state.path = '/feed'; await render(); await tick(16)
  assert.equal(destMain.scrollTop, 1600)
  assert.equal(window.scrollY, 0)
  await unmount()
})

test('blocked browser storage does not stop automatic cloud sync', async () => {
  cloud.clear()
  await mount('/feed')
  Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('Storage blocked') } })
  await tick(30_000)
  assert.equal(cloud.get('member-a').path, '/feed')
  await unmount()
})

test('a top-of-page restore resets the old page position', async () => {
  cloud.set('member-a', { path: '/feed', page_title: 'Feed', scroll_y: 0 })
  await mount('/missions')
  window.scrollY = 800
  await act(async () => document.querySelector('button').click())
  state.path = '/feed'; await render(); await tick(16)
  assert.equal(window.scrollY, 0)
  await unmount()
})

test('a loading route does not consume the restore before slow feed content arrives', async () => {
  cloud.set('member-a', { path: '/feed', page_title: 'Feed', scroll_y: 1800 })
  await mount('/missions')
  await act(async () => document.querySelector('button').click())
  const placeholder = document.createElement('div')
  placeholder.className = 'ss-route-loading'; placeholder.setAttribute('aria-busy', 'true')
  document.body.append(placeholder)
  maxScroll = 0; state.path = '/feed'; await render()
  await tick(4_000)
  placeholder.remove(); maxScroll = 5000
  await tick(250)
  assert.equal(window.scrollY, 1800, 'a feed slower than two seconds must still restore')
  await unmount()
})

test('an idle hidden tab cannot overwrite a newer position from another device', async () => {
  cloud.clear()
  await mount('/feed'); window.scrollY = 600; await tick(30_000)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  await act(async () => document.dispatchEvent(new window.Event('visibilitychange')))
  cloud.set('member-a', { path: '/search', page_title: 'Search', scroll_y: 200 })
  await tick(60_000)
  assert.equal(cloud.get('member-a').path, '/search', 'inactive tab must not keep winning the shared resume row')
  await unmount()
})

test('unchanged sessions do not repeatedly replace another device resume record', async () => {
  cloud.clear()
  await mount('/feed'); window.scrollY = 600; await tick(30_000)
  cloud.set('member-a', { path: '/search', page_title: 'Search', scroll_y: 200 })
  await tick(60_000)
  assert.equal(cloud.get('member-a').path, '/search')
  await unmount()
})

test('pending restore survives a streamed-route component remount', async () => {
  cloud.set('member-a', { path: '/feed', page_title: 'Feed', scroll_y: 1400 })
  await mount('/missions')
  await act(async () => document.querySelector('button').click())
  const placeholder = document.createElement('div')
  placeholder.className = 'ss-route-loading'; placeholder.setAttribute('aria-busy','true')
  document.body.append(placeholder)
  maxScroll = 0; state.path = '/feed'; await render(); await tick(250)
  await act(async () => root.unmount())
  root = createRoot(document.getElementById('app')); await render()
  placeholder.remove(); maxScroll = 5000; await tick(250)
  assert.equal(window.scrollY, 1400)
  await unmount()
})
