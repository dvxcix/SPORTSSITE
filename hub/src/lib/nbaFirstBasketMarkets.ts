export const NBA_FIRST_MARKETS = [
  {key:'first_score',label:'First basket'},
  {key:'first_field_goal',label:'First field goal'},
  {key:'team_first_score',label:'Team first basket'},
  {key:'team_first_field_goal',label:'Team first field goal'},
  ...(['2pt','3pt','free_throw','dunk','layup','other'] as const).map(method=>({key:`first_score_${method}`,label:`First basket · ${{'2pt':'2-pointer','3pt':'3-pointer',free_throw:'Free throw',dunk:'Dunk',layup:'Layup',other:'Other 2-pointer'}[method]}`})),
] as const
export function nbaFirstMarket(key:string){return NBA_FIRST_MARKETS.find(m=>m.key===key)}
export function nbaFirstLabel(key:string){return nbaFirstMarket(key)?.label}
