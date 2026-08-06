import { computeDugoutSpecsValue, type FieldBundle, type OddsProps } from '@slipsurge/core/matrixEngine'

export const PRECISION_HR_THRESHOLD = 0.32767159819476993

const FEATURES = ['sa','fhr','hr2','hrml','pa1','laser','moonshot','correlated','power','disparity','hrShock','fhrShock','sequenceSkew','hrmlCoupling','paCoupling','fhrCoupling','acceleration','accelPct','lowPublic','logPicks','battingOrder','mmOverride','mmL1','mmTrend','paper','paperTrend'] as const
const MEAN = [0.5436000432936698,0.544948606223115,0.5581069144181879,0.5501002038992232,0.5555067047507897,0.5389290146843404,0.5494580523738938,0.5479604949618745,0.5486642199490314,0.4155600994525581,0.0715059447949463,0.002672309814768178,-0.06883363498017823,0.7112067747213024,0.26249012098158186,0.5089816329259312,2.078615607547476,0.5277777777777778,0,0,0.5555555555555555,-6.95928061142405e-19,-8.56241715706501e-19,-1.630936601345716e-19,0.49999999999999933,2.9653392751740295e-20]
const SD = [0.28415567489477417,0.28402848475719994,0.2829224749024192,0.2872808026995747,0.26886507619751476,0.2705949371938737,0.25631998171201725,0.25627839391847956,0.2534107610101448,0.07760537546636691,0.1541047953103116,0.21988652990304342,0.19469409836402696,0.11280557676991369,0.10175460236519365,0.14546795944538174,3.102981786188651,0.2882293040050656,1,1,0.28688765527462196,0.29490413007951083,0.30513854046879496,0.0967200082896438,0.3012179501576488,0.09672000828964379]
const WEIGHTS = [0.12638224906169562,-0.0686041451885758,0.029022747321347585,0.3627650088927231,-0.03988226415905741,-0.05888121023184412,-0.11719678178073287,-0.2708670703939161,0.04067790383965397,-0.0470929476461931,0.03937791742980199,0.026366702807763726,-0.0013900941125399042,-0.12037190411792799,-0.056044834640150844,0.12708357671675455,0.41414755746253973,0.45550183116411985,0,0,-0.09411527413780309,-0.18006984754338795,0.13105460839220898,-0.03852331566651185,0.2991824993892292,0.03852331566651268]
const INTERCEPT = -2.4876561170648688

const implied = (o: number | null | undefined) => o == null ? null : o > 0 ? 100 / (o + 100) : -o / (-o + 100)
const average = (xs: Array<number | null | undefined>) => {
  const values = xs.filter((x): x is number => x != null && Number.isFinite(x))
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}
const percentile = (x: number | null, all: Array<number | null>) => {
  if (x == null) return 0.5
  const values = all.filter((n): n is number => n != null).sort((a, b) => a - b)
  return values.length < 2 ? 0.5 : values.filter(n => n <= x).length / values.length
}
const ratio = (a: number | null | undefined, b: number | null | undefined) => {
  const x = implied(a), y = implied(b)
  return x != null && y != null && y > 0 ? x / y : null
}

function acceleration(bundle: FieldBundle): number {
  const windows: any = bundle.statcastWindows ?? {}
  const season: any = windows.season ?? {}
  const fields = ['avgBatSpeed','barrelPct','hardHitPct','pullAirRate','fbRate','avgEv','squaredUpPct','blastPct']
  const deltas: number[] = []
  for (const window of ['l10','l5','l3','l1']) for (const field of fields) {
    const recent = windows[window]?.[field], baseline = season[field]
    if (recent == null || baseline == null) continue
    const scale = Math.max(Math.abs(baseline), field === 'avgEv' || field === 'avgBatSpeed' ? 5 : .05)
    deltas.push((recent - baseline) / scale)
  }
  deltas.sort((a, b) => b - a)
  return average(deltas.slice(0, Math.max(3, Math.ceil(deltas.length * .3))))
}

function oddsMap(props: OddsProps | null | undefined) {
  return {
    sa: implied(props?.sa?.fanduel), fhr: implied(props?.fhr?.fanduel), hr2: implied(props?.hr2?.fanduel),
    hrr: implied(props?.hrr?.fanduel), hits: implied(props?.hits?.fanduel), runs: implied(props?.runs?.fanduel),
    tb: implied(props?.tb?.fanduel), tb3: implied(props?.tb3?.fanduel), tb4: implied(props?.tb4?.fanduel), tb5: implied(props?.tb5?.fanduel),
    rbi: implied(props?.rbi?.fanduel), rbi2: implied(props?.rbi2?.fanduel), rbi3: implied(props?.rbi3?.fanduel),
    hrml: implied(props?.hrMl?.fanduel), pa1: implied(props?.pa1?.fanduel), laser: implied(props?.laser105?.fanduel),
    moonshot: implied(props?.moonshot?.fanduel), singles: implied(props?.singles?.fanduel), doubles: implied(props?.doubles?.fanduel),
    sb: implied(props?.stolenBases?.fanduel),
  }
}

// Scores one game's 18-player universe using the exact feature construction,
// scaler, coefficients and frozen cutoff from the Jul 16-31 train / Aug 1-5
// holdout experiment. This is deliberately an internal derived Matrix field:
// it is not a claimed probability and it is not displayed as a public metric.
export function computePrecisionHrScores(bundles: Map<string, FieldBundle>): Map<string, number> {
  const entries = [...bundles.entries()]
  const odds = entries.map(([, b]) => oddsMap(b.props))
  const keys = Object.keys(odds[0] ?? {}) as Array<keyof ReturnType<typeof oddsMap>>
  const accel = entries.map(([, b]) => acceleration(b))
  const result = new Map<string, number>()

  entries.forEach(([name, bundle], i) => {
    const props = bundle.props, marketPct: Record<string, number> = {}
    for (const key of keys) marketPct[key] = percentile(odds[i][key], odds.map(row => row[key]))
    const correlated = average(['hrr','hits','runs','tb','tb3','tb4','tb5','rbi','rbi2','rbi3'].map(k => marketPct[k]))
    const power = average(['sa','fhr','hr2','hrml','pa1','laser','moonshot'].map(k => marketPct[k]))
    const disparity = Math.max(...keys.map(k => Math.abs(marketPct[k] - .5)))
    const fhrPct = computeDugoutSpecsValue('fhr_pct', props, bundle.fhrAvg, bundle.saAvg) ?? 0
    const hrPct = computeDugoutSpecsValue('sa_pct', props, bundle.fhrAvg, bundle.saAvg) ?? 0
    const mm = bundle.mmByWindow, pp = bundle.ppRkByWindow
    const mmValues = [mm?.l10,mm?.l5,mm?.l3,mm?.l1].filter((v): v is number => v != null)
    const paperPcts = [pp?.l10,pp?.l5,pp?.l3,pp?.l1].filter((v): v is number => v != null).map(v => 1 - (v - 1) / Math.max(1, entries.length - 1))
    const x: Record<(typeof FEATURES)[number], number> = {
      sa:marketPct.sa,fhr:marketPct.fhr,hr2:marketPct.hr2,hrml:marketPct.hrml,pa1:marketPct.pa1,
      laser:marketPct.laser,moonshot:marketPct.moonshot,correlated,power,disparity,
      hrShock:-hrPct/100,fhrShock:-fhrPct/100,sequenceSkew:(hrPct-fhrPct)/100,
      hrmlCoupling:1/(ratio(props?.sa?.fanduel,props?.hrMl?.fanduel)??2),
      paCoupling:ratio(props?.pa1?.fanduel,props?.sa?.fanduel)??0,
      fhrCoupling:ratio(props?.fhr?.fanduel,props?.sa?.fanduel)??0,
      acceleration:accel[i],accelPct:percentile(accel[i],accel),
      // These were constant zero in the frozen experiment because the
      // historical snapshot shape did not carry public-pick data here.
      lowPublic:0,logPicks:0,
      battingOrder:(bundle.battingOrder ?? 9)/9,
      mmOverride:average(mmValues.map(v => -v/Math.max(1,entries.length-1))),
      mmL1:mm?.l1==null?0:-mm.l1/Math.max(1,entries.length-1),
      mmTrend:mm?.l1==null||mm?.l10==null?0:(mm.l10-mm.l1)/Math.max(1,entries.length-1),
      paper:average(paperPcts),paperTrend:paperPcts.length<2?0:paperPcts[paperPcts.length-1]-paperPcts[0],
    }
    let z = INTERCEPT
    FEATURES.forEach((feature, j) => { z += ((x[feature] - MEAN[j]) / SD[j]) * WEIGHTS[j] })
    result.set(name, 1 / (1 + Math.exp(-z)))
  })
  return result
}
