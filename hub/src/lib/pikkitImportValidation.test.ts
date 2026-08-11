import assert from 'node:assert/strict'
import test from 'node:test'
import { isValidPikkitGameMetadata, isValidPikkitTeamName } from './pikkitImportValidation'

test('accepts full MLB team names used by the automated scraper', () => {
  assert.equal(isValidPikkitGameMetadata({
    gameDate: '2026-08-11',
    homeTeam: 'New York Yankees',
    awayTeam: 'St. Louis Cardinals',
    gameKey: 'STL@NYY',
  }), true)
})

test('accepts abbreviated team metadata used by manual imports', () => {
  assert.equal(isValidPikkitGameMetadata({
    gameDate: '2026-08-11',
    homeTeam: 'NYY',
    awayTeam: 'BOS',
    gameKey: 'BOS@NYY-G2',
  }), true)
})

test('rejects malformed or unbounded metadata', () => {
  assert.equal(isValidPikkitTeamName('New York Yankees<script>'), false)
  assert.equal(isValidPikkitTeamName('A'.repeat(81)), false)
  assert.equal(isValidPikkitGameMetadata({
    gameDate: '08/11/2026',
    homeTeam: 'New York Yankees',
    awayTeam: 'Boston Red Sox',
    gameKey: 'BOS@NYY',
  }), false)
  assert.equal(isValidPikkitGameMetadata({
    gameDate: '2026-08-11',
    homeTeam: 'New York Yankees',
    awayTeam: 'Boston Red Sox',
    gameKey: 'BOS@NYY?admin=true',
  }), false)
})

