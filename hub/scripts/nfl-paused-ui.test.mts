import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { chromium } from 'playwright-core'

test('last-seen quotes remain readable without actions or overflow on mobile and desktop', async () => {
  const source = await readFile(new URL('../src/app/the-sideline/NflLastSeen.tsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/app/the-sideline/nflLastSeen.module.css', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const compiledModule = { exports: {} as { NflLastSeen: React.ComponentType<{ board: unknown }> } }
  const imports: Record<string, unknown> = { 'react/jsx-runtime': jsxRuntime, '@/components/BookLogo': { BookLogo: () => null, bookName: (vendor: string) => vendor }, './nflLastSeen.module.css': { __esModule: true, default: { root: 'root', rows: 'rows', row: 'row', book: 'book', history: 'history' } } }
  new Function('require', 'module', 'exports', compiled)((id: string) => { assert.ok(id in imports, id); return imports[id] }, compiledModule, compiledModule.exports)
  const board = { legacyUnverified:true, lastSeen: { offers: [{ playerId: 1, name: 'Example Player', team: 'CHI', label: 'First touchdown', propType:'first_td', offer: { vendor: 'FanDuel', type: 'milestone', line: 1, current: { odds: 400 }, updatedAt: '2026-11-02T14:05:00.000Z' } }], lines: [] }, openingOnly:{ offers: [{ playerId: 2, name: 'Opening Player', team: 'SEA', label: 'Anytime touchdown', propType:'anytime_td', offer: { vendor:'DraftKings',type:'milestone',line:1,current:{odds:200},updatedAt:'2026-11-02T12:00:00.000Z',isOpeningOnly:true } }], lines:[] } }
  const html = renderToStaticMarkup(React.createElement(compiledModule.exports.NflLastSeen, { board }))
  const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true })
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } })
      await page.route('**/*', route => route.abort())
      await page.setContent(`<style>body{margin:0;color:white;background:#111} ${css}</style>${html}`)
      await page.getByText('Last seen prices').click()
      await page.getByText('Opening prices').click()
      assert.equal(await page.locator('text=Example Player').count(), 1)
      assert.equal(await page.locator('text=Historical prices · unverified').count(), 1)
      assert.match(await page.locator('time').first().innerText(), /Nov 2, 9:05 AM ET/)
      assert.match(await page.locator('time').last().innerText(), /Nov 2, 7:00 AM ET/)
      assert.equal(await page.locator('button, [title], [role=tooltip]').count(), 0)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      await page.screenshot({ path: `../../nfl-paused-ui-${width}.png` })
      await page.close()
    }
  } finally { await browser.close() }
})
