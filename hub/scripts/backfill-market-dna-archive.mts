import { archiveMarketDnaDate } from '../src/lib/marketDna'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const start = process.argv[2]
const end = process.argv[3] ?? start

if (!DATE_RE.test(start ?? '') || !DATE_RE.test(end ?? '') || start! > end!) {
  throw new Error('Usage: npm run backfill:market-dna -- YYYY-MM-DD [YYYY-MM-DD]')
}

const dates: string[] = []
for (let cursor = new Date(`${start}T12:00:00Z`); cursor <= new Date(`${end}T12:00:00Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
  dates.push(cursor.toISOString().slice(0, 10))
}

let games = 0
let players = 0
const failures: Array<{ date: string; error: string }> = []
for (const date of dates) {
  try {
    const result = await archiveMarketDnaDate(date)
    games += result.games
    players += result.players
    console.log(`${date}: ${result.games} games, ${result.players} players`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown archive error'
    failures.push({ date, error: message })
    console.error(`${date}: ${message}`)
  }
}

console.log(JSON.stringify({ start, end, games, players, failures }, null, 2))
if (failures.length) process.exitCode = 1
