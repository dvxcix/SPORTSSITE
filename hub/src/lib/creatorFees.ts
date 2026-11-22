type Rate={percentage?:number|null;fixed?:{amount:string;currency:string}|null;source?:string}
export function whopFeeRows(value:unknown,prefix=''): {label:string;percentage:number|null;fixed:string|null;source:string|null}[]{
 if(!value||typeof value!=='object'||Array.isArray(value))return []
 const rate=value as Rate
 if('percentage' in value&&'fixed' in value)return [{label:prefix.replaceAll('_',' '),percentage:typeof rate.percentage==='number'?rate.percentage:null,fixed:rate.fixed?`${rate.fixed.amount} ${rate.fixed.currency.toUpperCase()}`:null,source:typeof rate.source==='string'?rate.source:null}]
 return Object.entries(value).filter(([key])=>!['default','maximum','minimum','reset','regions','child_markups'].includes(key)).flatMap(([key,child])=>whopFeeRows(child,prefix?`${prefix} · ${key}`:key))
}
