import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ts = require('typescript')
const source = readFileSync(new URL('../src/components/layout/ProductTelemetry.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function mount(initialVisibility = 'visible') {
  let now = 0, id = 0
  const frames = new Map(), listeners = new Map(), effects = [], events = []
  const document = { visibilityState: initialVisibility, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }
  const window = { requestAnimationFrame: fn => { frames.set(++id, fn); return id }, cancelAnimationFrame: key => frames.delete(key), addEventListener() {}, removeEventListener() {} }
  const module = { exports: {} }
  const imports = { react: { useEffect: fn => effects.push(fn) }, 'next/navigation': { usePathname: () => '/feed' }, '@/lib/productTelemetry': { recordProductInteraction: (name, options) => events.push({ name, ...options }) } }
  new Function('require', 'module', 'exports', 'document', 'window', 'performance', compiled)(name => imports[name], module, module.exports, document, window, { now: () => now })
  module.exports.ProductTelemetry()
  const cleanup = effects.map(fn => fn())
  return { events, frames, listeners, hide() { document.visibilityState = 'hidden'; listeners.get('visibilitychange')?.() }, show() { document.visibilityState = 'visible'; listeners.get('visibilitychange')?.() }, frame(elapsed) { now = elapsed; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()) }, unmount() { cleanup.forEach(fn => fn?.()) } }
}
test('visible route records actual foreground frame delay', () => {
  const page = mount(); page.frame(5); page.frame(20)
  assert.deepEqual(page.events.map(e => e.name), ['route_view', 'route_ready'])
  assert.equal(page.events[1].durationMs, 20); page.unmount()
})
test('genuinely slow visible route remains classified slow', () => {
  const page = mount(); page.frame(5); page.frame(3000)
  assert.equal(page.events[1].name, 'slow_interaction'); page.unmount()
})
test('initially hidden route never reports a foreground timing after becoming visible', () => {
  const page = mount('hidden'); page.show(); page.frame(60000); page.frame(120000)
  assert.deepEqual(page.events.map(e => e.name), ['route_view']); page.unmount()
})
test('hidden interval between frames invalidates timing even after return', () => {
  const page = mount(); page.frame(5); page.hide(); page.show(); page.frame(120000)
  assert.deepEqual(page.events.map(e => e.name), ['route_view']); page.unmount()
})
test('unmount cancels pending callbacks and visibility listener', () => {
  const page = mount(); page.frame(5); page.unmount()
  assert.equal(page.frames.size, 0); assert.equal(page.listeners.size, 0)
})
