import type { SidelinePlayer } from './types'

type MetricField = keyof Pick<SidelinePlayer, 'volume'|'geometry'|'redZone'|'breakaway'|'evidence'|'redZoneLooks'|'targets'|'receptions'|'targetShare'|'carries'|'carryShare'|'airYards'|'separation'|'yacAboveExpected'|'rushOverExpected'|'explosivePlays'|'passingYards'|'cpoe'>
export type PlayerMetric = { label:string; field:MetricField; suffix?:string; score?:boolean }

/** One metric catalogue for the player drawer and comparison. No scoring logic. */
export const MATCHUP_METRICS:readonly PlayerMetric[] = [
  {label:'Volume',field:'volume',score:true},
  {label:'Geometry',field:'geometry',score:true},
  {label:'Red zone',field:'redZone',score:true},
  {label:'Breakaway',field:'breakaway',score:true},
  {label:'Evidence',field:'evidence',score:true},
  {label:'RZ looks',field:'redZoneLooks'},
]
export const TRACKING_METRICS:readonly PlayerMetric[] = [
  {label:'Targets',field:'targets'}, {label:'Receptions',field:'receptions'},
  {label:'Target share',field:'targetShare',suffix:'%'}, {label:'Carries',field:'carries'},
  {label:'Carry share',field:'carryShare',suffix:'%'}, {label:'aDOT',field:'airYards'},
  {label:'Separation',field:'separation'}, {label:'YACOE',field:'yacAboveExpected'},
  {label:'RYOE/A',field:'rushOverExpected'}, {label:'Explosives',field:'explosivePlays'},
  {label:'Pass yards',field:'passingYards'}, {label:'CPOE',field:'cpoe'},
]
export function playerMetricValue(player:SidelinePlayer & {hasTracking:boolean}, metric:PlayerMetric):number|null {
  const value=player[metric.field]
  return player.hasTracking&&!player.unavailableMetrics?.includes(metric.field)&&Number.isFinite(value) ? value : null
}
