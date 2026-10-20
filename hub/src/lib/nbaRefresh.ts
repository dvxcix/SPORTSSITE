// Visible tools refresh automatically. Focus and visibility events share the
// same cadence; repeated tab switching cannot become a manual refresh loop.
export function watchNbaRefresh(refresh:()=>void|Promise<void>,milliseconds=60000){
 const cadence=Math.max(15000,milliseconds)
 let last=Date.now(),pending=false,closed=false
 const update=async()=>{if(closed||pending||document.visibilityState!=='visible'||Date.now()-last<cadence)return;last=Date.now();pending=true;try{await refresh()}catch{/* The owning view renders its request error. */}finally{pending=false}}
 const schedule=()=>setTimeout(()=>{void update();if(!closed)timer=schedule()},cadence+Math.floor(Math.random()*cadence*.1))
 let timer=schedule()
 document.addEventListener('visibilitychange',update);window.addEventListener('focus',update)
 return()=>{closed=true;clearTimeout(timer);document.removeEventListener('visibilitychange',update);window.removeEventListener('focus',update)}
}
