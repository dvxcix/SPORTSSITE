import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { accountSettingsActor } from '@/lib/supabase/accountSettingsActor'
export async function GET(request: Request){
 const account = await accountSettingsActor(request)
 if(account.error)return account.error
 const {data,error}=await createAdminClient().from('creator_entitlements').select('id,status,current_period_end,product:creator_products(title),member:users!creator_entitlements_user_id_fkey(username,display_name,avatar_url)').eq('creator_id',account.user.id).order('created_at',{ascending:false}).limit(200)
 if(error)return NextResponse.json({error:'Members could not be loaded.'},{status:503})
 return NextResponse.json({members:(data??[]).map(row=>({...row,status:['active','trialing'].includes(row.status)&&row.current_period_end&&Date.parse(row.current_period_end)<=Date.now()?'expired':row.status}))},{headers:{'Cache-Control':'private, no-store'}})
}
