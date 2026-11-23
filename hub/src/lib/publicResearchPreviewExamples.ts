import type { PreviewBoard, PreviewSport } from './publicResearchPreview'

// Curated FanDuel pregame slices from the saved November 8 boards.
// Dates and quote observations are preserved for the labeled offline example.
// Portraits/positions and NBA point logs are from that matchup's captured roster;
// the public projection contains no proprietary scores, weights or model inputs.
export const PUBLIC_PREVIEW_EXAMPLES: Record<PreviewSport, PreviewBoard> = {
  "nba": {
    "game": {
      "id": "21718060",
      "date": "2026-11-08",
      "start": "2026-11-08T23:00:00+00:00",
      "away": "LAL",
      "home": "DET",
      "awayScore": 121,
      "homeScore": 116,
      "state": "final"
    },
    "book": "FanDuel",
    "capturedAt": "2026-11-08T22:55:20.658005+00:00",
    "players": [
      {
        "id": 17553995,
        "name": "Austin Reaves",
        "portraitUrl": "https://a.espncdn.com/i/headshots/nba/players/full/4066457.png",
        "position": "G",
        "recent": [23,28,29,26,16,21,19,27,21,25],
        "team": "LAL",
        "prices": [
          { "line": 15, "price": -2000, "opening": -1400 },
          { "line": 20, "price": -370, "opening": -295 },
          { "line": 25, "price": -128, "opening": 102 },
          { "line": 30, "price": 220, "opening": 265 },
          { "line": 35, "price": 540, "opening": 630 }
        ]
      },
      {
        "id": 413,
        "name": "Collin Sexton",
        "portraitUrl": "https://a.espncdn.com/i/headshots/nba/players/full/4277811.png",
        "position": "G",
        "recent": [5,13,9,21,0,14,6,10,0],
        "team": "LAL",
        "prices": [
          { "line": 10, "price": -210, "opening": -180 },
          { "line": 15, "price": 190, "opening": 220 },
          { "line": 20, "price": 630, "opening": 750 },
          { "line": 25, "price": 1500, "opening": 1800 }
        ]
      },
      {
        "id": 17895858,
        "name": "Quentin Grimes",
        "portraitUrl": "https://a.espncdn.com/i/headshots/nba/players/full/4397014.png",
        "position": "G",
        "recent": [10,13,3,2,23,3,7,7,6,2],
        "team": "LAL",
        "prices": [
          { "line": 10, "price": -225, "opening": -174 },
          { "line": 15, "price": 196, "opening": 240 },
          { "line": 20, "price": 680, "opening": 870 },
          { "line": 25, "price": 1700, "opening": 2500 }
        ]
      },
      {
        "id": 38017705,
        "name": "Walker Kessler",
        "portraitUrl": "https://a.espncdn.com/i/headshots/nba/players/full/4433136.png",
        "position": "C",
        "recent": [26,22,2,13,11,10,16,15,15,16],
        "team": "LAL",
        "prices": [
          { "line": 10, "price": -430, "opening": -330 },
          { "line": 15, "price": 116, "opening": 142 },
          { "line": 20, "price": 430, "opening": 480 },
          { "line": 25, "price": 1400, "opening": 1400 }
        ]
      },
      {
        "id": 17896075,
        "name": "Cade Cunningham",
        "portraitUrl": "https://a.espncdn.com/i/headshots/nba/players/full/4432166.png",
        "position": "G-F",
        "recent": [22,16,26,19,30,20,33,26],
        "team": "DET",
        "prices": [
          { "line": 15, "price": -2500, "opening": -1600 },
          { "line": 20, "price": -400, "opening": -340 },
          { "line": 25, "price": -125, "opening": -122 },
          { "line": 30, "price": 230, "opening": 210 },
          { "line": 35, "price": 600, "opening": 480 }
        ]
      },
      {
        "id": 397,
        "name": "Duncan Robinson",
        "portraitUrl": "https://a.espncdn.com/i/headshots/nba/players/full/3157465.png",
        "position": "F",
        "recent": [21,17,21,12,13,17,24,27],
        "team": "DET",
        "prices": [
          { "line": 10, "price": -700, "opening": -520 },
          { "line": 15, "price": -150, "opening": -122 },
          { "line": 20, "price": 235, "opening": 255 },
          { "line": 25, "price": 680, "opening": 800 },
          { "line": 30, "price": 1500, "opening": 1700 }
        ]
      },
      {
        "id": 101,
        "name": "John Collins",
        "portraitUrl": "https://a.espncdn.com/i/headshots/nba/players/full/3908845.png",
        "position": "F-C",
        "recent": [6,23,16,2,4,4,4,16],
        "team": "DET",
        "prices": [
          { "line": 10, "price": -205, "opening": -186 },
          { "line": 15, "price": 230, "opening": 235 },
          { "line": 20, "price": 830, "opening": 870 },
          { "line": 25, "price": 2500, "opening": 3000 }
        ]
      },
      {
        "id": 3547270,
        "name": "Paul Reed",
        "portraitUrl": "https://a.espncdn.com/i/headshots/nba/players/full/4278562.png",
        "position": "F",
        "recent": [6,19,8,22,16,12,11,8],
        "team": "DET",
        "prices": [
          { "line": 10, "price": -410, "opening": -390 },
          { "line": 15, "price": 122, "opening": 126 },
          { "line": 20, "price": 460, "opening": 450 },
          { "line": 25, "price": 1400, "opening": 1300 }
        ]
      }
    ],
    "example": true
  },
  "nfl": {
    "game": {
      "id": "2026_09_TB_CHI",
      "date": "2026-11-08",
      "start": "2026-11-09T01:20:00+00:00",
      "away": "TB",
      "home": "CHI",
      "awayScore": 24,
      "homeScore": 27,
      "state": "final"
    },
    "book": "FanDuel",
    "capturedAt": "2026-11-09T01:19:37.799+00:00",
    "players": [
      {
        "id": 278135,
        "name": "Bucky Irving",
        "portraitUrl": "https://static.www.nfl.com/image/upload/f_auto,q_auto/league/vkc00rvnix3f2b96vkwo",
        "position": "RB",
        "team": "TB",
        "prices": [
          { "line": 10, "price": -198, "opening": -192 },
          { "line": 25, "price": 250, "opening": 235 },
          { "line": 40, "price": 700, "opening": 680 },
          { "line": 50, "price": 1200, "opening": 1100 },
          { "line": 60, "price": 1700, "opening": 1700 }
        ]
      },
      {
        "id": 903,
        "name": "Cade Otton",
        "portraitUrl": "https://static.www.nfl.com/image/upload/f_auto,q_auto/league/yanr6h9aplae3jyzimf7",
        "position": "TE",
        "team": "TB",
        "prices": [
          { "line": 10, "price": -750, "opening": -900 },
          { "line": 25, "price": -158, "opening": -182 },
          { "line": 40, "price": 182, "opening": 158 },
          { "line": 50, "price": 320, "opening": 280 },
          { "line": 60, "price": 550, "opening": 450 }
        ]
      },
      {
        "id": 100,
        "name": "Chris Godwin Jr.",
        "portraitUrl": "https://static.www.nfl.com/image/upload/f_auto,q_auto/league/ilkheljdx4hbjpisulke",
        "position": "WR",
        "team": "TB",
        "prices": [
          { "line": 10, "price": -1000, "opening": -1100 },
          { "line": 25, "price": -194, "opening": -198 },
          { "line": 40, "price": 148, "opening": 146 },
          { "line": 50, "price": 250, "opening": 255 },
          { "line": 60, "price": 410, "opening": 410 }
        ]
      },
      {
        "id": 33934479,
        "name": "Ted Hurst III",
        "portraitUrl": "https://static.www.nfl.com/image/upload/f_auto,q_auto/league/mmf6qmo6a2evw4feupcm",
        "position": "WR",
        "team": "TB",
        "prices": [
          { "line": 10, "price": -310, "opening": -380 },
          { "line": 25, "price": -108, "opening": -130 },
          { "line": 40, "price": 198, "opening": 168 },
          { "line": 50, "price": 300, "opening": 255 },
          { "line": 60, "price": 430, "opening": 370 }
        ]
      },
      {
        "id": 465,
        "name": "D'Andre Swift",
        "portraitUrl": "https://static.www.nfl.com/image/upload/f_auto,q_auto/league/owpmwzoilitcodc6cmxo",
        "position": "RB",
        "team": "CHI",
        "prices": [
          { "line": 10, "price": -380, "opening": -420 },
          { "line": 25, "price": 120, "opening": 110 },
          { "line": 40, "price": 320, "opening": 290 },
          { "line": 50, "price": 550, "opening": 490 },
          { "line": 60, "price": 880, "opening": 850 }
        ]
      },
      {
        "id": 598,
        "name": "Kalif Raymond",
        "portraitUrl": "https://static.www.nfl.com/image/upload/f_auto,q_auto/league/trqs4qje1ctnwxs9shwd",
        "position": "WR",
        "team": "CHI",
        "prices": [
          { "line": 10, "price": -260, "opening": -220 },
          { "line": 25, "price": 154, "opening": 188 },
          { "line": 40, "price": 390, "opening": 490 },
          { "line": 50, "price": 640, "opening": 880 },
          { "line": 60, "price": 920, "opening": 1280 }
        ]
      },
      {
        "id": 13874670,
        "name": "Colston Loveland",
        "portraitUrl": "https://static.www.nfl.com/image/upload/f_auto,q_auto/league/tdeidev1typrqjijtb3a",
        "position": "TE",
        "team": "CHI",
        "prices": [
          { "line": 25, "price": -750, "opening": -800 },
          { "line": 40, "price": -240, "opening": -240 },
          { "line": 50, "price": -130, "opening": -130 },
          { "line": 60, "price": 134, "opening": 134 }
        ]
      },
      {
        "id": 13874242,
        "name": "Luther Burden III",
        "portraitUrl": "https://static.www.nfl.com/image/upload/f_auto,q_auto/league/iyuwdz7pbowdkwzq2tg5",
        "position": "WR",
        "team": "CHI",
        "prices": [
          { "line": 25, "price": -1400, "opening": -1800 },
          { "line": 40, "price": -400, "opening": -470 },
          { "line": 50, "price": -230, "opening": -275 },
          { "line": 60, "price": -138, "opening": -172 }
        ]
      }
    ],
    "example": true
  }
}
