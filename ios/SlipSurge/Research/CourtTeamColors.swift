import SwiftUI

enum CourtTeamColors {
    // Mirrors the verified NBA palette in hub/src/lib/nbaTeamColors.ts.
    private static let palette: [String: (UInt32, UInt32)] = [
        "ATL": (0xC8102E, 0xFDB927),
        "BOS": (0x008348, 0xFFFFFF),
        "BKN": (0x000000, 0xFFFFFF),
        "CHA": (0x008CA8, 0x1D1060),
        "CHI": (0xCE1141, 0x000000),
        "CLE": (0x860038, 0xBC945C),
        "DAL": (0x0064B1, 0xBBC4CA),
        "DEN": (0x0E2240, 0xFEC524),
        "DET": (0x1D428A, 0xC8102E),
        "GSW": (0xFDB927, 0x1D428A),
        "HOU": (0xCE0E2D, 0x000000),
        "IND": (0x0C2340, 0xFFD520),
        "LAC": (0x12173F, 0xC8102E),
        "LAL": (0x552583, 0xFDB927),
        "MEM": (0x5D76A9, 0x12173F),
        "MIA": (0x98002E, 0x000000),
        "MIL": (0x00471B, 0xEEE1C6),
        "MIN": (0x266092, 0x79BC43),
        "NOP": (0x0A2240, 0xB4975A),
        "NYK": (0x1D428A, 0xF58426),
        "OKC": (0x007AC1, 0xEF3B24),
        "ORL": (0x0150B5, 0x9CA0A3),
        "PHI": (0x1D428A, 0xE01234),
        "PHX": (0x29127A, 0xE56020),
        "POR": (0xE03A3E, 0x000000),
        "SAC": (0x5A2D81, 0x6A7A82),
        "SAS": (0x000000, 0xC4CED4),
        "TOR": (0xD91244, 0x000000),
        "UTA": (0x4E008E, 0x79A3DC),
        "WAS": (0xE31837, 0x002B5C),
    ]

    static func colors(for code: String) -> (primary: Color, secondary: Color) {
        let aliases = ["GS": "GSW", "NO": "NOP", "NY": "NYK", "SA": "SAS",
                       "UTAH": "UTA", "WSH": "WAS", "PHO": "PHX", "BRK": "BKN"]
        let (primary, secondary) = palette[aliases[code] ?? code] ?? (0x263542, 0x141C25)
        return (Color(rgb: primary), Color(rgb: secondary))
    }
}
