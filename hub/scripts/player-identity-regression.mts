import assert from 'node:assert/strict'
import {
  canonicalProviderArchiveKey,
  normProviderPlayerKey,
  providerKeysForPlayer,
  resolvePlayerIdentity,
  resolveNameEntry,
  resolveProviderEntryForPlayer,
} from '../packages/core/src/nameNorm.ts'

const candidates = [
  { mlbId: 571970, name: 'Max Muncy', team: 'LAD' },
  { mlbId: 691777, name: 'Max Muncy', team: 'ATH' },
  { mlbId: 665953, name: 'Andrés Chaparro', team: 'WSH' },
]

assert.equal(resolvePlayerIdentity(candidates, 'Max Muncy', { provider: 'bdl', sourceId: 142 })?.mlbId, 571970)
assert.equal(resolvePlayerIdentity(candidates, 'Max Muncy', { provider: 'bdl', sourceId: 241414 })?.mlbId, 691777)
assert.equal(resolvePlayerIdentity(candidates, 'Max P. Muncy', { sourceTeam: 'OAK' })?.mlbId, 691777)
assert.equal(resolvePlayerIdentity(candidates, 'Max P. Muncy')?.mlbId, 691777)
assert.equal(resolvePlayerIdentity(candidates, 'Max Muncy', { sourceTeam: 'LAD' })?.mlbId, 571970)
assert.equal(resolvePlayerIdentity(candidates, 'Max Muncy'), undefined, 'An unscoped duplicate must fail closed')
assert.equal(resolvePlayerIdentity(candidates, 'Andres Chaparro')?.mlbId, 665953)

assert.equal(normProviderPlayerKey('Max Muncy (2002)'), 'max muncy 2002')
assert.equal(canonicalProviderArchiveKey('max muncy '), 'max muncy 2002')
assert.equal(canonicalProviderArchiveKey('max muncy'), 'max muncy')
assert.deepEqual(providerKeysForPlayer(691777, 'Max Muncy'), ['max muncy 2002', 'max p muncy'])
assert.deepEqual(providerKeysForPlayer(665953, 'Andrés Chaparro'), ['andres chaparro', 'andrs chaparro'])

const averages = {
  'max muncy': { fd: 395 },
  'max muncy 2002': { fd: 627 },
  'andres chaparro': { fd: 650 },
}
assert.equal(resolveProviderEntryForPlayer(averages, { mlbId: 571970, name: 'Max Muncy' })?.fd, 395)
assert.equal(resolveProviderEntryForPlayer(averages, { mlbId: 691777, name: 'Max Muncy' })?.fd, 627)
assert.equal(resolveProviderEntryForPlayer(averages, { mlbId: 665953, name: 'Andrés Chaparro' })?.fd, 650)

// Synthetic IDs: these tests exercise names, not a hard-coded MLB ID mapping.
for (const [displayName, sourceName] of [
  ['Leonardo Bernal', 'Leo Bernal'],
  ['Leo Bernal', 'Leonardo Bernal'],
]) {
  const roster = [{ mlbId: 1, name: displayName, team: 'STL' }]
  assert.equal(resolvePlayerIdentity(roster, sourceName, { sourceTeam: 'STL' })?.mlbId, 1)
  assert.equal(resolveNameEntry({ [sourceName.toLowerCase()]: 900 }, displayName.toLowerCase()), 900)
  assert.equal(resolveProviderEntryForPlayer(
    { [sourceName.toLowerCase()]: { fd: 900 } },
    { mlbId: 1, name: displayName },
  )?.fd, 900)
  assert.equal(resolvePlayerIdentity([
    ...roster, { mlbId: 2, name: displayName, team: 'STL' },
  ], sourceName), undefined, 'Ambiguous alias must fail closed')
}
assert.equal(resolvePlayerIdentity([{ mlbId: 1, name: 'Leonardo Other' }], 'Leo Other'), undefined)
assert.equal(resolvePlayerIdentity([{ mlbId: 1, name: 'Leonardo Bernal' }], 'Leo Other'), undefined)
assert.equal(resolveProviderEntryForPlayer(
  { 'leo bernal': 900, 'leonardo bernal': 950 }, { mlbId: 1, name: 'Leo Bernal' },
), 900, 'Exact provider entry keeps precedence')
console.log('Player identity regression checks passed')
