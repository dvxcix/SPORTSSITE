import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchOfficialHrOutcomes } from '../src/lib/hrOutcomes'

const game = { gamePk: 1, awayAbbr: 'AWY', homeAbbr: 'HME' }

function finalFeed(homeRuns = 1) {
  return {
    gameData: { status: { abstractGameState: 'Final', detailedState: 'Final' } },
    liveData: {
      boxscore: {
        teams: {
          away: { players: {} },
          home: {
            players: {
              ID10: {
                person: { id: 10, fullName: 'Real Homer' },
                stats: { batting: { homeRuns } },
              },
            },
          },
        },
      },
    },
  }
}

test('grades anytime from the final box score but refuses FHR when play-by-play is partial', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async input => new Response(JSON.stringify(
    String(input).includes('playByPlay') ? { allPlays: [] } : finalFeed(),
  ), { status: 200 })

  try {
    const outcome = (await fetchOfficialHrOutcomes([game])).get(1)!
    assert.equal(outcome.anytimeGraded, true)
    assert.equal(outcome.totalHomeRuns, 1)
    assert.deepEqual(outcome.hitters.map(hitter => hitter.name), ['Real Homer'])
    assert.equal(outcome.fhrGraded, false)
    assert.equal(outcome.firstHr, null)
    assert.match(outcome.issues.join(' '), /does not reconcile/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('grades FHR only after the play-by-play HR multiset reconciles', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async input => new Response(JSON.stringify(
    String(input).includes('playByPlay')
      ? {
          allPlays: [{
            atBatIndex: 7,
            result: { eventType: 'home_run' },
            matchup: { batter: { id: 10, fullName: 'Real Homer' } },
          }],
        }
      : finalFeed(),
  ), { status: 200 })

  try {
    const outcome = (await fetchOfficialHrOutcomes([game])).get(1)!
    assert.equal(outcome.anytimeGraded, true)
    assert.equal(outcome.fhrGraded, true)
    assert.equal(outcome.firstHr?.name, 'Real Homer')
  } finally {
    globalThis.fetch = originalFetch
  }
})
