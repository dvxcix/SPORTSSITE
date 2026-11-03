import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { nbaOddsDelta } from '../src/lib/nbaOddsDelta.ts'

const source = await readFile(new URL('../src/app/the-paint/PaintPrice.tsx', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
const require = createRequire(import.meta.url)
const mocks: Record<string, unknown> = {
  'react/jsx-runtime': require('react/jsx-runtime'),
  'lucide-react': { ArrowDownRight: () => null, ArrowUpRight: () => null, Minus: () => null },
  '@/lib/nbaPaint': { nbaOdds: (value: number | null) => value == null ? '—' : String(value) },
  '@/lib/nbaOddsDelta': { nbaOddsDelta },
  './paint.module.css': { default: {} },
}
const mod = { exports: {} as { PaintPriceValue: React.ComponentType<Record<string, unknown>> } }
new Function('require', 'module', 'exports', code)((name: string) => {
  assert.ok(name in mocks, `Unexpected dependency ${name}`)
  return mocks[name]
}, mod, mod.exports)

test('a known opening remains visible without a false zero when no distinct comparison exists', () => {
  const props = { current: 500, opening: 500, at: '2026-11-03T17:00:00Z' }
  const unavailable = renderToStaticMarkup(React.createElement(mod.exports.PaintPriceValue, { ...props, comparable: false }))
  assert.match(unavailable, /No comparable opening capture yet/)
  assert.match(unavailable, /Δ —/)
  assert.match(unavailable, /open 500/)
  const observedRepeat = renderToStaticMarkup(React.createElement(mod.exports.PaintPriceValue, { ...props, comparable: true }))
  assert.match(observedRepeat, /Unchanged implied probability/)
  assert.match(observedRepeat, /0\.0 pp/)
})
