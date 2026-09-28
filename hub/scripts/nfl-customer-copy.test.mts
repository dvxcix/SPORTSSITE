import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const compiled = await build({
  stdin: { contents: 'export {SidelineCheatsheets} from "./src/app/the-sideline/SidelineCheatsheets"', resolveDir: process.cwd() },
  bundle: true, write: false, outdir: '.artifacts/copy-check', platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime'], loader: { '.css': 'empty' },
  plugins: [{ name: 'render-boundaries', setup(b) {
    b.onResolve({ filter: /^next\/|SidelineResearchClient$/ }, args => ({ path: args.path, namespace: 'copy-test' }))
    b.onLoad({ filter: /.*/, namespace: 'copy-test' }, () => ({ contents: 'export default ()=>null;export const PlayerIdentity=()=>null', loader: 'js' }))
  } }],
})
const mod = { exports: {} as any }
new Function('require', 'module', 'exports', compiled.outputFiles.find(file => file.path.endsWith('.js'))!.text)(createRequire(import.meta.url), mod, mod.exports)
for (const isAdmin of [false, true]) {
  const html = renderToStaticMarkup(React.createElement(mod.exports.SidelineCheatsheets, {
    isAdmin,
    lens: { season: 2026, teams: [], players: [], runGaps: [], dvp: [], coverage: { advanced: 'partial', pbpPlays: 620, rosterPlayers: 40 } },
    board: { players: [] },
  }))
  assert.doesNotMatch(html, /NGS|PBP|fallback|charted plays|roster matches|performance rates disagree|Model \+ market|Data coverage/i)
  assert.match(html, /Sideline Cheatsheets/)
  assert.match(html, /Cheatsheet controls/)
  assert.match(html, /Market Edge/)
  console.log((isAdmin ? 'Admin' : 'Member') + ': customer cheatsheet renders without diagnostic banners')
}
for (const file of ['SidelineCheatsheets.tsx', 'SidelineMatchupLab.tsx', 'SidelineClient.tsx']) {
  const source = readFileSync('src/app/the-sideline/' + file, 'utf8')
  assert.doesNotMatch(source, /Private route · noindex|plays load on demand|Recorded PBP|NGS partial|PBP fallback|Where performance rates disagree|lens\.coverage\.label/)
}
console.log('NFL customer surfaces: internal-copy regression checks PASS')
