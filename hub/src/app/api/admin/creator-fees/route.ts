import { NextResponse } from 'next/server'
import { creatorAdminAuth } from '@/lib/creatorAdminAuth'
import { creatorWhop, getCreatorPaymentState } from '@/lib/creatorWhop'
import { getWhopPlatformCompanyId } from '@/lib/whopPlatform'
import { whopFeeRows } from '@/lib/creatorFees'
import { safeApiError } from '@/lib/safeApiError'
export async function GET(request:Request){
 const auth=await creatorAdminAuth(request);if('error' in auth)return NextResponse.json({error:auth.error},{status:auth.status})
 try{
  const creatorId=new URL(request.url).searchParams.get('creator')
  let accountId=getWhopPlatformCompanyId()
  if(creatorId){const {data}=await auth.admin.from('users').select('whop_connected_company_id').eq('id',creatorId).maybeSingle();if(!data?.whop_connected_company_id)return NextResponse.json({error:'Connected creator not found.'},{status:404});accountId=data.whop_connected_company_id;await getCreatorPaymentState(accountId)}
  const schedule=await creatorWhop<{account_id:string}>(`/accounts/${encodeURIComponent(accountId)}/fees`)
  if(schedule.account_id!==accountId)throw new Error('Fee account mismatch')
  return NextResponse.json({rows:whopFeeRows(schedule),checkedAt:new Date().toISOString()},{headers:{'Cache-Control':'private, no-store'}})
 }catch(cause){return safeApiError('creator-fees-read',cause,'Whop fees could not be read with this API permission. The payment connection may still be active; review fees in Whop.',502)}
}
