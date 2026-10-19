// Revalidate immediately when a member returns; idle/background tabs stay quiet.
export function watchNbaRefresh(refresh:()=>void|Promise<void>,milliseconds=60000){
 let last=0
 const update=()=>{if(document.visibilityState!=='visible'||Date.now()-last<1000)return;last=Date.now();void refresh()}
 const timer=setInterval(update,milliseconds)
 document.addEventListener('visibilitychange',update);window.addEventListener('focus',update)
 return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',update);window.removeEventListener('focus',update)}
}
