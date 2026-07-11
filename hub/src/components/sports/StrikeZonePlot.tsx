'use client'
import { pitchOutcomeColor } from '@/lib/mlb-api'
import type { MLBPitch } from '@/lib/mlb-api'

// Statcast plate-crossing coordinates: pX is in feet from center of plate,
// raw sign convention is the CATCHER's-eye view (positive = catcher's right
// = 1B side). Broadcast strike-zone graphics (ESPN, Statcast, etc.) use the
// PITCHER's-eye view instead — looking IN at the batter, the mirror image —
// where a RHB (who stands on the 3B side) appears on the RIGHT. We negate
// pX below to flip into that convention, and place RHB on the right to match.
const ZONE_HALF_WIDTH = 0.83
const PLOT_X_RANGE = 2.2   // horizontal feet shown each side of center
const PLOT_Z_MIN = 0.3
const PLOT_Z_MAX = 4.6

// Batter-in-stance artwork (user-supplied traced silhouette). Natural
// bounding box is ~70x156, facing left in its original orientation.
const BATTER_ART_W = 70
const BATTER_ART_H = 156
const BATTER_ART_POLYGONS = [
  "65.9974171 0.000190243902 48.2371976 5.34984878 38.1276366 9.03677561 17.0533683 16.2964829 16.852661 18.1114098 18.0759293 18.6964098 39.6248561 12.7037268 49.0485878 10.359922 56.918978 8.03514146 67.6810756 4.65070244 68.0739293 3.36750732 67.1607585 0.570921951",
  "0.0890341463 21.2964732 -0.000380487805 21.8776683 0.0890341463 22.704278 0.760595122 24.5810341 1.96674146 25.6321317 2.50322927 25.520839 2.63735122 25.1850585 1.22954634 21.2964732 0.670229268 20.983522",
  "17.9917463 22.3020073 23.2215512 25.1185683 25.5016244 26.1240073 28.0489902 26.9953244 21.6796244 32.024422 20.070161 30.1248366 14.9297707 26.3247146",
  "30.8878098 134.275763 29.1889317 135.080495 25.8368341 136.555837 21.6800049 137.98552 19.7575902 138.96908 18.9081512 140.936202 19.4893463 142.098593 23.7802976 143.394154 29.367761 143.394154 32.9443463 142.992739 35.9834927 142.858617 37.8164927 143.394154 43.0462976 143.082154 42.7999317 138.834959 39.872078 137.493739",
  "35.1342439 147.909022 31.6023659 149.831437 28.2949756 150.725583 26.5513902 152.065851 26.3288049 153.09412 26.3288049 154.43629 30.6644634 155.776559 39.1122439 156.000095 40.6322927 155.642437 43.8959268 154.703583 48.6786585 154.837705 54.6675366 154.033924 55.6958049 152.512924 55.293439 150.367924 39.4261463 144.95929",
  "30.5301512 71.7850171 31.3348829 74.1640171 29.4571756 78.9914561 27.0439317 83.0493585 23.4901756 91.9347 20.2712488 99.3513585 19.1982732 101.870188 19.1982732 104.318627 20.0705415 107.676432 22.8119561 111.454676 25.2670537 115.793188 31.8038341 129.505968 32.4078585 130.415334 32.8768098 131.464529 32.2737366 132.584115 31.066639 132.584115 30.4635659 133.563871 31.4242976 135.313163 33.2125902 136.432749 39.9691024 139.506139 40.3866878 124.32848 32.2737366 98.651261 34.0163707 79.6211634 31.4690049 72.6943829",
  "25.5014341 24.3135512 27.1108976 25.855478 27.2450195 26.9959902 32.2731659 24.3135512 36.8009707 23.1816 33.4802634 19.888478 33.8160439 14.6586732 25.5014341 14.1221854",
  "19.2657146 12.3786 19.6005439 15.6641122 21.0093 18.8155024 22.2163976 20.5590878 22.811861 22.2351366 25.5009585 24.3135512 28.5182268 23.978722 32.4077634 19.1503317 32.7425927 16.2006 32.0320317 10.0366976 23.5566659 10.9032585",
  "1.22926098 21.2962829 1.60879756 20.2908439 2.15479756 20.0625512 3.03943171 18.8820878 4.24652927 18.8820878 5.11784634 17.9441854 6.3249439 17.9441854 7.12967561 17.5418195 8.00099268 17.8766488 9.54387073 20.5590878 10.4817732 20.5590878 11.4206268 22.301722 11.4206268 24.3135512 10.1469439 26.3253805 9.94623659 29.2751122 11.4206268 32.9629902 14.0355293 36.1143805 13.6331634 39.8022585 19.7352366 45.9709171 14.9077976 47.0438927 11.2865049 48.7865268 5.38609024 47.8476732 4.44723659 43.8249659 4.58135854 37.6563073 4.11240732 27.9338927 2.63706585 25.1848683",
  "8.73885366 17.541439 8.00165854 17.8762683 9.54358537 20.5587073 11.4212927 24.3131707 13.2086341 25.341439 13.8345366 26.325 14.9293902 26.325 16.0470732 26.1014634 18.1930244 24.5367073 18.7941951 22.7341463 18.2149024 21.9332195 18.5278537 20.5587073 18.4365366 19.1509024 17.3882927 17.831561 16.9193415 15.3289024 15.309878 14.5907561 14.3491463 14.724878 13.6338293 13.9876829 12.5827317 14.1218049 12.2031951 14.724878 11.2196341 14.6801707 10.3701951 15.3507805 10.2360732 15.8206829 9.47604878 15.842561 8.87297561 16.7367073",
  "49.1030927 61.7274878 51.1815073 64.0741463 51.1815073 64.8113415 52.6568488 66.2200976 54.4670195 69.7063171 55.3383366 74.0648049 54.936922 78.2216341 53.7298244 81.7088049 49.7737024 86.6028293 46.7564341 90.1565854 45.0128488 93.2413902 43.8732878 97.2640976 42.9344341 104.237488 41.7948732 111.345 45.2145073 117.043756 47.3595073 121.737073 48.5666049 127.570902 51.6514098 137.159195 55.3383366 144.668122 56.0089463 150.367829 50.3101902 150.367829 43.1360927 148.021171 38.6434829 145.003902 41.1242634 142.925488 42.331361 140.511293 40.1188244 138.701122 37.235678 130.319927 35.3579707 125.693195 30.5971171 117.98261 27.8480927 113.423415 27.1108976 109.936244 27.7139707 106.85239 28.7194098 90.8271951 31.736678 77.1486585 31.4018488 74.0648049 31.4684341 72.657 30.5305317 71.7847317 29.7258 69.7063171 29.6848976 69.0899268 35.558678 66.2866829 36.9674341 64.8113415 47.292922 61.7940732",
  "35.5589634 21.2962829 34.9558902 22.5033805 31.6028415 23.5088195 27.2443537 26.9959902 25.8365488 27.9338927 22.812622 44.4813073 25.0318171 56.9670146 25.0318171 58.7771854 26.8419878 64.3427707 27.5801341 65.817161 26.9095244 68.7003073 28.4514512 69.7066976 35.5589634 66.2870634 36.9667683 64.811722 47.2932073 61.7944537 49.103378 61.7278683 50.3095244 59.6485024 50.3095244 57.5035024 48.2986463 55.1568439 48.6334756 53.9497463 47.9628659 52.7426488 48.1645244 46.9097707 47.694622 45.5010146 47.9628659 39.6681366 47.4939146 33.6336 47.5605 30.6829171 45.2138415 26.123722 41.8617439 22.8382098 37.7049146 21.2962829",
  "25.8366439 27.934178 20.3861561 31.712422 19.5909366 32.531422 18.2915707 33.1639829 16.7382293 34.5090073 14.0358146 36.1146659 13.6334488 39.8015927 19.735522 45.9702512 28.1833024 41.8809585 30.3292537 41.9475439 31.4022293 42.7522756 33.0307171 41.0733732 34.2853756 39.8015927 32.4742537 36.5170317 27.3861805 31.5231293",
  "17.0530829 13.4513854 19.735522 12.2176537 23.5565707 10.9030683 26.9781073 10.5530195 32.0909122 10.5482634 32.0385951 13.3505561 32.6873268 15.7181415 33.6547171 17.1754098 35.223278 17.1754098 35.9614244 15.2615561 35.9614244 11.4395561 34.6867902 9.69692195 33.9495951 6.20975122 32.8433268 4.26165366 31.1511073 2.79011707 27.7809366 1.51643415 23.9589366 1.51643415 20.8075463 2.72353171 18.6625463 4.66782439 17.5895707 7.14860488 17.8578146 11.573678 16.8523756 12.9148976",
]

function BatterArt({ color }: { color: string }) {
  return (
    <g fill={color}>
      {BATTER_ART_POLYGONS.map((pts, i) => <polygon key={i} points={pts} />)}
    </g>
  )
}

function BatterSilhouette({ side, width, height }: { side: 'L' | 'R'; width: number; height: number }) {
  // Pitcher's-eye view: RHB (3B side) renders on the RIGHT, LHB on the LEFT.
  // Artwork's natural orientation faces LEFT, so the LHB case (on the left,
  // needs to face right toward the zone) gets the mirror instead of RHB.
  const onLeft = side === 'L'
  const artH = height * 0.85
  const artW = artH * (BATTER_ART_W / BATTER_ART_H)
  const x = onLeft ? width * 0.03 : width - artW - width * 0.03
  const y = height * 0.06

  return (
    <g
      transform={`translate(${x}, ${y}) scale(${artW / BATTER_ART_W}, ${artH / BATTER_ART_H}) ${onLeft ? `translate(${BATTER_ART_W},0) scale(-1,1)` : ''}`}
      opacity={0.45}
    >
      <BatterArt color="var(--text-3)" />
    </g>
  )
}

export function StrikeZonePlot({ pitches, batSide, width = 130, height = 160 }: { pitches: MLBPitch[]; batSide?: 'L' | 'R'; width?: number; height?: number }) {
  const withCoords = pitches.filter(p => p.pitchData?.coordinates?.pX != null && p.pitchData?.coordinates?.pZ != null)

  const zTop = pitches.find(p => p.pitchData?.strikeZoneTop != null)?.pitchData?.strikeZoneTop ?? 3.5
  const zBot = pitches.find(p => p.pitchData?.strikeZoneBottom != null)?.pitchData?.strikeZoneBottom ?? 1.5

  // Negate pX to flip catcher's-eye raw coordinates into pitcher's-eye view.
  const toX = (pX: number) => ((-pX + PLOT_X_RANGE) / (PLOT_X_RANGE * 2)) * width
  const toY = (pZ: number) => height - ((pZ - PLOT_Z_MIN) / (PLOT_Z_MAX - PLOT_Z_MIN)) * height

  const zoneX1 = toX(-ZONE_HALF_WIDTH), zoneX2 = toX(ZONE_HALF_WIDTH)
  const zoneY1 = toY(zTop), zoneY2 = toY(zBot)

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', flexShrink: 0 }}>
      {/* Backdrop */}
      <rect x={0} y={0} width={width} height={height} rx={6} fill="var(--surface-2)" />

      {/* Batter silhouette for handedness context, like a broadcast strike-zone graphic */}
      {batSide && <BatterSilhouette side={batSide} width={width} height={height} />}

      {/* Strike zone rectangle — bold enough to read as the reference frame
          even at small sizes, which is the whole point of this plot. */}
      <rect
        x={zoneX1} y={zoneY1} width={zoneX2 - zoneX1} height={zoneY2 - zoneY1}
        fill="none" stroke="var(--text-2)" strokeWidth={2}
      />

      {/* Checkerboard 3x3 zone cells — visual reference grid like broadcast
          strike-zone graphics, neutral tones so it doesn't compete with the
          red/green/blue pitch-outcome dots. */}
      {Array.from({ length: 9 }, (_, idx) => {
        const row = Math.floor(idx / 3), col = idx % 3
        const cw = (zoneX2 - zoneX1) / 3, ch = (zoneY2 - zoneY1) / 3
        const isDark = (row + col) % 2 === 0
        return (
          <rect
            key={idx}
            x={zoneX1 + col * cw} y={zoneY1 + row * ch}
            width={cw} height={ch}
            fill={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.015)'}
          />
        )
      })}

      {/* Zone thirds guide lines */}
      <line x1={zoneX1 + (zoneX2 - zoneX1) / 3} y1={zoneY1} x2={zoneX1 + (zoneX2 - zoneX1) / 3} y2={zoneY2} stroke="var(--border)" strokeWidth={1} />
      <line x1={zoneX1 + (zoneX2 - zoneX1) * 2 / 3} y1={zoneY1} x2={zoneX1 + (zoneX2 - zoneX1) * 2 / 3} y2={zoneY2} stroke="var(--border)" strokeWidth={1} />
      <line x1={zoneX1} y1={zoneY1 + (zoneY2 - zoneY1) / 3} x2={zoneX2} y2={zoneY1 + (zoneY2 - zoneY1) / 3} stroke="var(--border)" strokeWidth={1} />
      <line x1={zoneX1} y1={zoneY1 + (zoneY2 - zoneY1) * 2 / 3} x2={zoneX2} y2={zoneY1 + (zoneY2 - zoneY1) * 2 / 3} stroke="var(--border)" strokeWidth={1} />

      {/* Home plate outline at the bottom for orientation */}
      <path
        d={`M ${width * 0.32} ${height} L ${width * 0.68} ${height} L ${width * 0.68} ${height - 6} L ${width * 0.5} ${height - 12} L ${width * 0.32} ${height - 6} Z`}
        fill="var(--border-2)" opacity={0.6}
      />

      {/* Pitch dots, in order thrown */}
      {withCoords.map((p, i) => {
        const x = toX(p.pitchData!.coordinates!.pX!)
        const y = toY(p.pitchData!.coordinates!.pZ!)
        const color = pitchOutcomeColor(p)
        const isLast = i === withCoords.length - 1
        return (
          <g key={p.index ?? i}>
            {isLast && <circle cx={x} cy={y} r={11} fill="none" stroke={color} strokeWidth={1.5} opacity={0.6} />}
            <circle cx={x} cy={y} r={8} fill={color} stroke="var(--bg)" strokeWidth={1.5} opacity={isLast ? 1 : 0.85} />
            <text x={x} y={y + 3} textAnchor="middle" fontSize={9} fontWeight={800} fill="#fff">
              {i + 1}
            </text>
          </g>
        )
      })}

      {withCoords.length === 0 && (
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize={10} fill="var(--text-3)">No pitch data</text>
      )}
    </svg>
  )
}
