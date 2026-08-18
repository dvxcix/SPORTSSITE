import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderContactRecap } from '../src/lib/contactRecapGif'
import type { DailyContactEvent } from '../src/lib/contactRecapTypes'

const event: DailyContactEvent = {
  id: 'smoke', kind: 'home_run', gamePk: 1, gameIndex: 0, gameDate: '2026-08-17',
  eventTime: '2026-08-17T23:00:00Z', atBatIndex: 1, plateAppearanceNumber: 1, pitchNumber: 4,
  batterId: 680757, batterName: 'Elly De La Cruz', batterTeam: 'CIN',
  pitcherId: 543243, pitcherName: 'Test Pitcher', pitcherTeam: 'STL',
  inning: 1, half: 'Top', result: 'home_run', description: 'Home run', rbi: 3,
  isFirstHr: true, isGrandSlam: false, exitVelocity: 110.4, launchAngle: 27,
  distance: 428, hitBearing: 3, hcX: 137, hcY: 49, coordinateSource: 'statcast',
  pitchType: 'FF', pitchSpeed: 96.2, bbType: 'fly_ball', parksHrCount: 30, parkHrList: null,
  game: {
    gamePk: 1, gameIndex: 0, gameDate: '2026-08-17', startTime: '2026-08-17T23:00:00Z',
    status: 'Final', venueId: 1, venueName: 'Great American Ball Park', parkTeamAbbr: 'CIN',
    homeTeamId: 113, homeTeam: 'CIN', homeName: 'Cincinnati Reds', homeScore: 5,
    awayTeamId: 138, awayTeam: 'STL', awayName: 'St. Louis Cardinals', awayScore: 2,
  },
  marketContext: {
    primaryLabel: 'Anytime Home Run', frozenAt: '2026-08-17T22:59:00Z',
    primary: [
      { marketKey: 'sa', marketLabel: 'Anytime Home Run', book: 'fanduel', bookLabel: 'FanDuel', odds: 420 },
      { marketKey: 'sa', marketLabel: 'Anytime Home Run', book: 'draftkings', bookLabel: 'DraftKings', odds: 400 },
      { marketKey: 'sa', marketLabel: 'Anytime Home Run', book: 'williamhill_us', bookLabel: 'Caesars', odds: 390 },
    ],
    specials: [
      { marketKey: 'fhr', marketLabel: 'First Home Run', book: 'fanduel', bookLabel: 'FanDuel', odds: 800 },
      { marketKey: 'laser105', marketLabel: 'Laser 105+', book: 'fanduel', bookLabel: 'FanDuel', odds: 1400 },
      { marketKey: 'laser110', marketLabel: 'Laser 110+', book: 'fanduel', bookLabel: 'FanDuel', odds: 2600 },
      { marketKey: 'moonshot', marketLabel: 'Moonshot 420+', book: 'fanduel', bookLabel: 'FanDuel', odds: 2200 },
      { marketKey: 'pa1', marketLabel: '1st PA Home Run', book: 'fanduel', bookLabel: 'FanDuel', odds: 1800 },
      { marketKey: 'hr2', marketLabel: '2+ Home Runs', book: 'fanduel', bookLabel: 'FanDuel', odds: 7500 },
      { marketKey: 'hrMl', marketLabel: 'HR + Team Win', book: 'fanduel', bookLabel: 'FanDuel', odds: 700 },
      { marketKey: 'rbi3', marketLabel: '3+ RBI', book: 'fanduel', bookLabel: 'FanDuel', odds: 1400 },
    ],
  },
}

const eventCount = Math.max(1, Number(process.env.CONTACT_RECAP_SMOKE_EVENTS ?? 1))
const events = Array.from({ length: eventCount }, (_, index) => ({
  ...event,
  id: `smoke-${index + 1}`,
  gameIndex: index,
  batterName: `Elly De La Cruz ${index + 1}`,
  game: { ...event.game, gameIndex: index },
}))

const exports = [
  { format: 'mp4', aspect: 'landscape' },
  { format: 'mp4', aspect: 'square' },
  { format: 'mp4', aspect: 'vertical' },
  { format: 'gif', aspect: 'vertical' },
] as const

for (const { format, aspect } of exports) {
  const body = await renderContactRecap(events, format, aspect)
  const path = join(tmpdir(), `slipsurge-contact-recap-smoke-${aspect}.${format}`)
  await writeFile(path, body)
  console.log(`${aspect} ${format} ${events.length} events ${body.length} bytes ${path}`)
}
