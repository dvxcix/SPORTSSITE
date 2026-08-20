import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { renderContactAlertMedia } from '../src/lib/contactRecapGif'
import type { DailyContactEvent } from '../src/lib/contactRecapTypes'

const event: DailyContactEvent = {
  id: 'alert-smoke', kind: 'home_run', gamePk: 123456, gameIndex: 0, gameDate: '2026-08-19',
  eventTime: '2026-08-20T00:15:00Z', atBatIndex: 17, plateAppearanceNumber: 2, pitchNumber: 5,
  batterId: 545361, batterName: 'Mike Trout', batterTeam: 'LAA',
  pitcherId: 543243, pitcherName: 'Test Pitcher', pitcherTeam: 'TEX',
  inning: 3, half: 'bottom', result: 'home_run', description: 'Three-run home run', rbi: 3,
  isFirstHr: true, isGrandSlam: false, exitVelocity: 111.8, launchAngle: 27,
  distance: 442, hitBearing: 8, hcX: 145, hcY: 43, coordinateSource: 'mlb_live',
  pitchType: 'FF', pitchSpeed: 97.1, bbType: 'fly_ball', parksHrCount: 30, parkHrList: null,
  game: {
    gamePk: 123456, gameIndex: 0, gameDate: '2026-08-19', startTime: '2026-08-19T23:10:00Z',
    status: 'In Progress', venueId: 1, venueName: 'Angel Stadium', parkTeamAbbr: 'LAA',
    homeTeamId: 108, homeTeam: 'LAA', homeName: 'Los Angeles Angels', homeScore: 3,
    awayTeamId: 140, awayTeam: 'TEX', awayName: 'Texas Rangers', awayScore: 0,
  },
  marketContext: {
    primaryLabel: 'Anytime Home Run', frozenAt: '2026-08-19T23:09:00Z',
    primary: [
      { marketKey: 'sa', marketLabel: 'Anytime Home Run', book: 'fanduel', bookLabel: 'FanDuel', odds: 320 },
      { marketKey: 'sa', marketLabel: 'Anytime Home Run', book: 'draftkings', bookLabel: 'DraftKings', odds: 330 },
      { marketKey: 'sa', marketLabel: 'Anytime Home Run', book: 'betmgm', bookLabel: 'BetMGM', odds: 310 },
    ],
    specials: [
      { marketKey: 'fhr', marketLabel: 'First Home Run', book: 'fanduel', bookLabel: 'FanDuel', odds: 650 },
      { marketKey: 'laser110', marketLabel: 'Laser 110+', book: 'fanduel', bookLabel: 'FanDuel', odds: 2400 },
      { marketKey: 'moonshot', marketLabel: 'Moonshot 420+', book: 'fanduel', bookLabel: 'FanDuel', odds: 1800 },
      { marketKey: 'rbi3', marketLabel: '3+ RBI', book: 'fanduel', bookLabel: 'FanDuel', odds: 1300 },
    ],
  },
}

const nearEvent: DailyContactEvent = {
  ...event,
  id: 'near-alert-smoke', kind: 'near_hr', atBatIndex: 23, plateAppearanceNumber: null,
  result: 'double', description: 'Deep fly ball off the wall for a double', rbi: 1,
  isFirstHr: false, exitVelocity: 106.8, launchAngle: 34, distance: 397,
  parksHrCount: 19, parkHrList: 'AZ,ATL,BAL,BOS,CHC,CIN,CLE,COL,CWS,DET,HOU,KC,LAA,MIA,MIL,MIN,PHI,STL,TEX',
  marketContext: {
    primaryLabel: 'To Hit a Double', frozenAt: '2026-08-19T23:09:00Z',
    primary: [
      { marketKey: 'doubles', marketLabel: 'To Hit a Double', book: 'fanduel', bookLabel: 'FanDuel', odds: 360 },
      { marketKey: 'doubles', marketLabel: 'To Hit a Double', book: 'draftkings', bookLabel: 'DraftKings', odds: 350 },
    ],
    specials: [],
  },
}

for (const sample of [event, nearEvent]) {
  const media = await renderContactAlertMedia(sample)
  const path = join(tmpdir(), media.filename)
  await writeFile(path, media.body)
  const metadata = await sharp(media.body, { animated: true }).metadata()
  console.log(JSON.stringify({ kind: sample.kind, path, bytes: media.body.length, animated: media.animated, width: metadata.width, height: metadata.pageHeight ?? metadata.height, pages: metadata.pages ?? 1 }))
}
