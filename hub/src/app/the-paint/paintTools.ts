import { Activity, ClipboardList, HeartPulse, Layers3, Shield, Target } from 'lucide-react'

export const PAINT_TOOLS = [
  {key:'research',label:'The Court',icon:Layers3},
  {key:'odds-board',label:'Odds Board',icon:Layers3},
  {key:'first-basket',label:'First basket',icon:Target},
  {key:'cheatsheets',label:'Cheatsheets',icon:ClipboardList},
  {key:'usage',label:'Player trends',icon:Activity},
  {key:'score',label:'SlipSurge Score',icon:Target},
  {key:'slate',label:'Slate Edge',icon:Layers3},
  {key:'dvp',label:'Defense × position',icon:Shield},
  {key:'divergence',label:'Cross-market',icon:Activity},
  {key:'matchup',label:'Matchup Lab',icon:Target},
  {key:'availability',label:'Availability',icon:HeartPulse},
  {key:'game-markets',label:'Game markets',icon:Shield},
] as const
export type PaintTool = typeof PAINT_TOOLS[number]['key']
