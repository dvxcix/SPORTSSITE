import {observedAt} from './nba'
export type NbaCached<T>={value:T;fetchedAt:string;stale:boolean}
export async function nbaSharedCache<T>(_key:string,_ttl:number,_stale:number,load:()=>Promise<T>):Promise<NbaCached<T>>{return {value:await load(),fetchedAt:observedAt,stale:false}}
