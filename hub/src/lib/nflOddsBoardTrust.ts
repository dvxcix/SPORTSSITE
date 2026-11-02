export type NflOddsBoardPhase={gameId:string;token:string|null;observedAt:string|null;checkedAt:number}
export type NflOddsBoardProof={phaseToken:string;phaseObservedAt:string;nextStart:string|null}
export type NflOddsBoardTrust={safe:boolean;reason:'safe'|'invalid'|'failed'|'changed'|'expired'|'boundary'|'resync';until:number}

/** A receipt time must never extend a cached clock's original observation. */
export function nflOddsBoardTrust(proof:NflOddsBoardProof,phase:NflOddsBoardPhase|null,openedAt:number,now:number,requireAfter=0):NflOddsBoardTrust {
  const observed=Date.parse(proof.phaseObservedAt), start=proof.nextStart==null?null:Date.parse(proof.nextStart)
  if(!/^[a-f0-9]{64}$/.test(proof.phaseToken)||!Number.isFinite(observed)||observed>now||(start!=null&&!Number.isFinite(start)))return {safe:false,reason:'invalid',until:now}
  if(start!=null&&now>=start)return {safe:false,reason:'boundary',until:start}
  const relevant=phase&&phase.checkedAt>=openedAt?phase:null
  if(relevant&&!relevant.token&&relevant.checkedAt>=observed)return {safe:false,reason:'failed',until:now}
  const phaseAt=Date.parse(relevant?.observedAt??'')
  if(relevant?.token&&(!Number.isFinite(phaseAt)||phaseAt>now))return {safe:false,reason:'invalid',until:now}
  if(relevant?.token&&relevant.token!==proof.phaseToken&&phaseAt>=observed)return {safe:false,reason:'changed',until:now}
  const validAt=relevant?.token===proof.phaseToken?Math.max(observed,phaseAt):observed
  if(validAt<=requireAfter)return {safe:false,reason:'resync',until:now}
  const until=Math.min(validAt+48000,start??Infinity)
  return now>=until?{safe:false,reason:'expired',until}:{safe:true,reason:'safe',until}
}
