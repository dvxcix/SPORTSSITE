#!/usr/bin/env node
// Manual/catch-up run for the Savant Affinity sync (src/lib/affinitySync.ts).
// The daily cron (api/cron/savant-sync-affinity) covers normal operation —
// this is for a first backfill or re-running after a schema change, same
// role as backfill-statcast-pitch-log.mjs. Deliberately a standalone script
// (plain node, no `@/` alias) — keep this in lockstep with affinitySync.ts
// if either changes.
//
// Usage (from hub/): node --env-file=.env.local scripts/sync-affinity.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — run with --env-file=.env.local from hub/')
  process.exit(1)
}
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const BASE = 'https://baseballsavant.mlb.com/app/affinity'
const WRITE_CHUNK_SIZE = 1000

function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.length > 0)
  if (!lines.length) return []
  const parseLine = line => {
    const fields = []
    let cur = '', inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false }
        else cur += ch
      } else {
        if (ch === '"') inQuotes = true
        else if (ch === ',') { fields.push(cur); cur = '' }
        else cur += ch
      }
    }
    fields.push(cur)
    return fields
  }
  const header = parseLine(lines[0])
  return lines.slice(1).map(line => {
    const values = parseLine(line)
    const row = {}
    header.forEach((h, i) => { row[h] = values[i] ?? '' })
    return row
  })
}

async function fetchAffinityCsv(name) {
  const res = await fetch(`${BASE}/${name}.csv`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/csv,text/plain,*/*',
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Affinity CSV ${res.status}: ${name} :: ${text.slice(0, 300)}`)
  return parseCsv(text)
}

const num = v => (v === undefined || v === '' ? null : Number(v))

async function syncSide(side) {
  const profilesTable = side === 'pitchers' ? 'pitcher_affinity_profiles' : 'hitter_affinity_profiles'
  const matchesTable = side === 'pitchers' ? 'pitcher_affinity_matches' : 'hitter_affinity_matches'

  const [indexRows, profileRows, matchRows] = await Promise.all([
    fetchAffinityCsv(`affinity_${side}ByHittingProfile_index`),
    fetchAffinityCsv(`affinity_${side}ByHittingProfile_profiles`),
    fetchAffinityCsv(`affinity_${side}ByHittingProfile_matchScores`),
  ])
  console.log(`[${side}] fetched index=${indexRows.length} profiles=${profileRows.length} matches=${matchRows.length}`)

  const profileByKey = new Map(profileRows.map(r => [r.key, r]))
  const profileUpserts = indexRows
    .filter(r => r.key && r.id && r.side)
    .map(r => {
      const p = profileByKey.get(r.key)
      return {
        key: r.key, season: Number(r.year), mlb_id: Number(r.id), hand: r.side, name: r.name,
        freq_bbhb: num(p?.freq_bbhb), freq_so: num(p?.freq_so), freq_bunt: num(p?.freq_bunt),
        freq_barrel: num(p?.freq_barrel), freq_solidcontact: num(p?.freq_solidcontact),
        freq_flareburner: num(p?.freq_flareburner), freq_poorlyunder: num(p?.freq_poorlyunder),
        freq_poorlytopped: num(p?.freq_poorlytopped), freq_poorlyweak: num(p?.freq_poorlyweak),
        updated_at: new Date().toISOString(),
      }
    })

  for (let i = 0; i < profileUpserts.length; i += WRITE_CHUNK_SIZE) {
    const { error } = await admin.from(profilesTable).upsert(profileUpserts.slice(i, i + WRITE_CHUNK_SIZE), { onConflict: 'key,season' })
    if (error) throw error
  }
  console.log(`[${side}] upserted ${profileUpserts.length} profiles`)

  const season = indexRows[0] ? Number(indexRows[0].year) : new Date().getFullYear()
  const matchUpserts = matchRows
    .filter(r => r.key1 && r.key2 && r.match_score !== '')
    .map(r => ({ key1: r.key1, key2: r.key2, season, match_score: Number(r.match_score), updated_at: new Date().toISOString() }))

  for (let i = 0; i < matchUpserts.length; i += WRITE_CHUNK_SIZE) {
    const { error } = await admin.from(matchesTable).upsert(matchUpserts.slice(i, i + WRITE_CHUNK_SIZE), { onConflict: 'key1,key2,season' })
    if (error) throw error
    process.stdout.write(`\r[${side}] upserted matches ${Math.min(i + WRITE_CHUNK_SIZE, matchUpserts.length)}/${matchUpserts.length}`)
  }
  console.log()

  return { profiles: profileUpserts.length, matches: matchUpserts.length }
}

async function main() {
  const pitchers = await syncSide('pitchers')
  const hitters = await syncSide('hitters')
  console.log('Done:', JSON.stringify({ pitchers, hitters }))
}

main().catch(e => { console.error(e); process.exitCode = 1 })
