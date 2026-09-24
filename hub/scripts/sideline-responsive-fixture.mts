// Local-only: actual Sideline component, synthetic data, no production writes/auth bypass.
import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { build } from 'esbuild'

const times = ['2026-09-22T10:00:00.000Z', '2026-09-22T11:00:00.000Z', '2026-09-22T12:00:00.000Z']
const teams = [
  { abbr: 'ATL', name: 'Atlanta Falcons', color: '#a71930', logo: null },
  { abbr: 'GB', name: 'Green Bay Packers', color: '#203731', logo: null },
]
const names = ['Bijan Robinson', 'Brian Robinson Jr.', 'Olamide Zaccheaus', 'Charlie Woerner', 'Zachariah Branch', 'Christian Watson', 'Jayden Reed', 'Dontayvion Wicks', 'Josh Jacobs', 'Luke Musgrave']
const players = names.map((name, i) => ({
  id: i + 1, name, team: teams[i < 5 ? 0 : 1].abbr, position: i % 3 ? 'WR' : 'RB', jersey: i + 1,
  markets: ['first_td', 'anytime_td'].map(propType => ({
    key: propType, propType, category: 'touchdowns', label: propType === 'first_td' ? 'First TD' : 'Anytime TD', line: null,
    offers: ['fanduel', 'draftkings'].map(vendor => ({
      vendor, line: null, openingLine: null, type: 'milestone',
      current: { odds: i === 2 ? 12000 : 500 + i * 100 },
      opening: { odds: i === 2 ? 10000 : 550 + i * 100 }, updatedAt: times[2],
    })),
  })),
}))
// Populate the rich cells: empty baselines/yardage cannot catch compact-column collisions.
players.forEach((player, i) => Object.assign(player, {
  tdBaselines: ['first_td', 'anytime_td'].map(propType => ({ propType, vendor: 'fanduel', averageOdds: 12345, sampleGames: 18, deltaPct: i % 2 ? -0.339 : 1.031 })),
  markets: [...player.markets, {
    key: 'role-yards', propType: player.position === 'RB' ? 'rushing_yards' : 'receiving_yards', category: 'yards', label: 'Yards', line: 177.5,
    offers: [{ vendor: 'fanduel', type: 'over_under', line: 177.5, openingLine: 177.5, current: { over: -113, under: -110 }, opening: { over: -114, under: -110 }, updatedAt: times[2] }],
  }],
}))
const odds = { bdlGameId: 1, status: 'ready', capturedAt: times[2], source: 'snapshot', gameLines: [{ vendor: 'fanduel', moneylineHome: -250, moneylineAway: 205 }], players }
const ladderOdds = { ...odds, players: players.slice(0, 5).map((player, i) => ({
  ...player,
  publicPicks: i === 4 ? [] : [{ propType: 'receiving_yards', label: 'Receiving yards', rawMarket: 'Receiving yards', picks: [10, 100, 0, 40][i], capturedAt: times[2] }],
  markets: [...player.markets, ...[10, 20, 30, 40, 50, 60, 70].filter(line => !(i === 4 && line === 20)).flatMap(line => ['milestone', 'over_under'].map(type => ({
    key: 'receiving_yards:' + type + ':' + line, propType: 'receiving_yards', label: 'Receiving yards', category: 'receiving', line,
    offers: ['fanduel', 'draftkings'].map(vendor => ({
      vendor, type, line, openingLine: line,
      current: type === 'milestone' ? { odds: 100 + i * 100 + line } : { over: 100 + i * 100 + line, under: -100 - i * 50 },
      opening: type === 'milestone' ? { odds: 150 + i * 50 + line } : { over: 150 + i * 50 + line, under: -120 - i * 30 }, updatedAt: times[2],
    })),
  })))],
})) }
const windowData = { plays: 0, weeks: [], teams: [], players: [] }
const props = {
  games: [{ id: 'fixture', season: 2026, week: 3, gameType: 'REG', gameday: '2026-09-22', gametime: '13:00', stadium: 'Responsive test fixture', roof: 'Outdoors', surface: 'Grass', away: teams[0], home: teams[1] }],
  selectedId: 'fixture', sample: 'season', odds, gameState: null, touchdowns: [], timeline: times,
  lens: { season: 2026, status: 'awaiting-data', headline: 'Fixture', headlineDetail: '', aggressor: '',
    coverage: { sampleSeason: 2026, scheduleStart: 2026, trackingStart: 2026, playByPlayStart: 2026, usesPriorSeason: false, label: 'Fixture', detail: '' },
    windows: Object.fromEntries(['season', 'l1', 'l3', 'l5', 'l10'].map(key => [key, windowData])),
  },
}
const stubs: Record<string, string> = {
  'next/navigation': 'export const useRouter=()=>({push(){},replace(){},refresh(){}})',
  'next/dynamic': 'export default ()=>()=>null',
  'next/image': 'import React from "react";export default function Image({fill,priority,unoptimized,...props}){return <img {...props}/>}',
  '@/context/WatchlistContext': 'import {useState} from "react";export function useWatchlist(){const [items,set]=useState([]);return {items,add:async item=>set(old=>[...old,{...item,id:String(old.length+1),status:"pending"}]),remove:async id=>set(old=>old.filter(item=>item.id!==id))}}',
}
const bundled = await build({
  stdin: { contents: 'import {useState} from "react";import {createRoot} from "react-dom/client";import {SidelineBoardClient} from "./src/app/the-sideline/SidelineBoardClient";import {LadderBoard} from "./src/app/the-sideline/LadderBoard";function Props(){const [prop,onProp]=useState("receiving_yards");return <LadderBoard board={window.ladderOdds} prop={prop} onProp={onProp} onPlayer={()=>{}} scores={new Map([[1,{score:80,mm:4,label:"Receiving"}],[2,{score:20,mm:-3,label:"Receiving"}],[3,{score:50,mm:0,label:"Receiving"}],[4,{score:50,mm:null,label:"Receiving"}]])}/>};createRoot(document.getElementById("root")).render(location.pathname==="/props"?<Props/>:<SidelineBoardClient {...window.fixtureProps}/>);', loader: 'tsx', resolveDir: process.cwd() },
  bundle: true, write: false, outdir: '.artifacts/sideline-fixture', platform: 'browser', format: 'iife', jsx: 'automatic',
  tsconfig: 'tsconfig.json', define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'fixture-boundaries', setup(build) {
    build.onResolve({ filter: /^(next\/(navigation|dynamic|image)|@\/context\/WatchlistContext)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: process.cwd() }))
  } }],
})
const js = bundled.outputFiles.find(file => file.path.endsWith('.js'))!.text
const css = bundled.outputFiles.find(file => file.path.endsWith('.css'))!.text
const shellCss = `*{box-sizing:border-box}body{margin:0;background:#070b10;color:white;font-family:Arial,sans-serif;--layer-floating:100}button,input{font:inherit}.test-header{height:64px;background:#101822;padding:20px;position:sticky;top:0;z-index:110}.ss-mobile-dock{display:none}@media(max-width:767px),(max-width:1024px) and (any-pointer:coarse){.ss-mobile-dock{display:block;position:fixed;bottom:max(10px,env(safe-area-inset-bottom));left:10px;right:10px;z-index:100;height:64px;max-width:470px;margin:auto;padding:22px;border-radius:24px;background:#17222e;text-align:center}}`
createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1:4187')
  if (url.pathname === '/app.js') { res.setHeader('content-type', 'text/javascript'); res.end(js); return }
  if (url.pathname === '/app.css') { res.setHeader('content-type', 'text/css'); res.end(css + shellCss); return }
  if (url.pathname === '/api/nfl-matrices') { res.setHeader('content-type', 'application/json'); res.end('{"matrices":[]}'); return }
  if (url.pathname === '/the-sideline/market') {
    res.setHeader('content-type', 'application/json')
    const at = url.searchParams.get('at')
    res.end(JSON.stringify(at ? { frame: { capturedAt: at, board: { ...odds, capturedAt: at } } } : { odds, timeline: times, gameState: null, touchdowns: [] })); return
  }
  if (url.pathname !== '/' && url.pathname !== '/props') {
    const publicRoot = resolve('public')
    const asset = resolve(publicRoot, '.' + url.pathname)
    if (asset.startsWith(publicRoot + sep) && existsSync(asset) && statSync(asset).isFile()) {
      res.setHeader('content-type', asset.endsWith('.svg') ? 'image/svg+xml' : asset.endsWith('.png') ? 'image/png' : 'image/webp')
      res.end(readFileSync(asset)); return
    }
    res.writeHead(204); res.end(); return
  }
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><header class="test-header">SlipSurge · LOCAL TEST DATA</header><main id="root"></main><nav class="ss-mobile-dock">Home · Research · Community · Picks</nav><script>window.fixtureProps=' + JSON.stringify(props) + ';window.ladderOdds=' + JSON.stringify(ladderOdds) + '</script><script src="/app.js"></script></body></html>')
}).listen(4187, '127.0.0.1', () => console.log('Sideline fixture http://127.0.0.1:4187 (synthetic data only)'))
