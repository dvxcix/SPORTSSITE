export async function register(){
 if(process.env.NEXT_PUBLIC_DESIGN_REVIEW==='1'||process.env.SLIPSURGE_UI_BUILD_CHECK==='1'){
  const {installReviewNetworkGuard}=await import('../review/network-guard')
  installReviewNetworkGuard()
 }
}
