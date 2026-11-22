import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
export async function GET(){
 const client=await createClient();const {data:{user}}=await client.auth.getUser()
 if(!user)return NextResponse.json({error:'Sign in first.'},{status:401})
 const {data,error}=await createAdminClient().from('creator_entitlements').select('id,status,current_period_end,product:creator_products(title),member:users!creator_entitlements_user_id_fkey(username,display_name,avatar_url)').eq('creator_id',user.id).order('created_at',{ascending:false}).limit(200)
 if(error)return NextResponse.json({error:'Members could not be loaded.'},{status:503})
 return NextResponse.json({members:(data??[]).map(row=>({...row,status:['active','trialing'].includes(row.status)&&row.current_period_end&&Date.parse(row.current_period_end)<=Date.now()?'expired':row.status}))},{headers:{'Cache-Control':'private, no-store'}})
}
