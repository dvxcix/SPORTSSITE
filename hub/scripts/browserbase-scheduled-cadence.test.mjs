import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
const paths = {
  nbaPublic: '/api/cron/poll-pikkit-nba-picks',
  nbaDirect: '/api/cron/nba-book-first-capture',
  nflPublic: '/api/cron/poll-pikkit-nfl-picks',
  nflDirect: '/api/cron/poll-fanduel-nfl',
}
function checks(path) {
  const matches = config.crons.filter(row => row.path === path)
  assert.equal(matches.length, 1, `${path} must have one dispatcher`)
  const parts = matches[0].schedule.split(' ')
  assert.deepEqual(parts.slice(1), ['*', '*', '*', '*'])
  return parts[0].split(',').map(value => {
    assert.match(value, /^\d{1,2}$/)
    const minute = Number(value)
    assert.ok(minute >= 0 && minute < 60)
    return minute
  })
}

test('NBA and NFL decision checks do not start at the same minute', () => {
  const times = Object.values(paths).flatMap(path => checks(path)).sort((a, b) => a - b)
  assert.equal(new Set(times).size, times.length)
  assert.equal(config.crons.some(row => /(?:scrape-pikkit|poll-pikkit-picks|scrape-fanduel|scrape-mgm)(?:$|\?)/.test(row.path)), false, 'offseason MLB collectors remain unscheduled')
})

test('NBA checks leave a small release window after a full 450-second NFL session', () => {
  const nfl = checks(paths.nflDirect)
  for (const path of [paths.nbaPublic, paths.nbaDirect]) {
    for (const minute of checks(path)) {
      const sincePriorNfl = Math.min(...nfl.map(nflMinute => (minute - nflMinute + 60) % 60))
      assert.ok(sincePriorNfl >= 8, `${path} must allow the prior NFL session time to finish`)
    }
  }
})

test('an eight-game NFL slate and one NBA/public checkpoint can use the serialized lane within the late window', () => {
  const schedules = Object.fromEntries(Object.entries(paths).map(([name, path]) => [name, checks(path)]))
  let busyUntil = 0, nflGames = 0
  const completed = new Set(), starts = []
  for (let minute = 0; minute < 180; minute++) {
    for (const name of ['nbaPublic', 'nbaDirect', 'nflPublic', 'nflDirect']) {
      if (!schedules[name].includes(minute % 60) || minute < busyUntil) continue
      if (name === 'nflDirect') {
        if (nflGames >= 8) continue
        nflGames++
        busyUntil = minute + 7.5
      } else {
        if (completed.has(name)) continue
        completed.add(name)
        busyUntil = minute + 5
      }
      starts.push({ name, minute })
    }
  }
  assert.equal(nflGames, 8, 'all eight ready NFL games receive one paid attempt in the modeled window')
  for (const name of ['nbaPublic', 'nbaDirect', 'nflPublic']) {
    assert.ok(starts.some(item => item.name === name && item.minute < 60), `${name} receives its due slot within one hour`)
  }
})

test('late checkpoints receive a bounded decision before common NBA and NFL kickoff times', () => {
  for (const tipMinute of [0, 30]) {
    for (const path of [paths.nbaPublic, paths.nbaDirect]) {
      const candidates = [-60, 0].flatMap(hour => checks(path).map(minute => hour + minute))
      const before = candidates.filter(minute => minute >= tipMinute - 60 && minute < tipMinute)
      assert.ok(before.length > 0, `${path} must check during the last hour`)
      assert.ok(Math.min(...before) <= tipMinute - 30, `${path} first late check must be at least 30 minutes before tip`)
    }
    for (const path of [paths.nflPublic, paths.nflDirect]) {
      const candidates = [-180, -120, -60, 0].flatMap(hour => checks(path).map(minute => hour + minute))
      assert.ok(candidates.some(minute => minute >= tipMinute - 180 && minute <= tipMinute - 120), `${path} must check between three and two hours before kickoff`)
    }
  }
})
