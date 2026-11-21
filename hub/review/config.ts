import path from 'node:path'
import type {NextConfig} from 'next'
export function withPrivateDesignReview(base:NextConfig):NextConfig {
 const requested=process.env.SLIPSURGE_UI_REVIEW==='1'
 const privateBuild=requested&&process.env.SLIPSURGE_UI_REVIEW_BUILD==='1'&&!process.env.VERCEL
 const reviewDist=process.env.SLIPSURGE_UI_REVIEW_DIST??'.next-private-ui-review'
 if(privateBuild&&!/^\.next-private-[a-z0-9-]+$/.test(reviewDist))throw new Error('Private review output must stay in a local .next-private-* directory.')
 const active=requested&&(process.env.NODE_ENV==='development'||privateBuild)&&!process.env.VERCEL
 if(requested&&!active)throw new Error('Design review may run only with next dev or an explicit private local review build.')
 const root=process.cwd()
 return {...base,...(privateBuild?{distDir:reviewDist}:process.env.SLIPSURGE_UI_BUILD_CHECK==='1'?{distDir:'.next-ui-build-check'}:{}),env:{...base.env,NEXT_PUBLIC_DESIGN_REVIEW:active?'1':'0'},...(active?{
  devIndicators:false,
  logging:{browserToTerminal:false},
  onDemandEntries:{maxInactiveAge:3_600_000,pagesBufferLength:200},
  allowedDevOrigins:['127.0.0.1','localhost'],
  webpack(config:any,context:any){
   const result=base.webpack?base.webpack(config,context):config
   if(context.dev)result.devtool=false
   result.resolve.alias={...result.resolve.alias,
    '@supabase/ssr$':path.join(root,'review/supabase.ts'),
    '@supabase/supabase-js$':path.join(root,'review/supabase.ts'),
    '@/lib/supabase/admin$':path.join(root,'review/admin.ts'),
    '@/lib/nbaPaintData$':path.join(root,'review/nba.ts'),
    '@/lib/nbaResearchResources$':path.join(root,'review/nba-resources.ts'),
    '@/lib/nbaSharedCache$':path.join(root,'review/cache.ts'),
    '@slipsurge/core/espn-api$':path.join(root,'review/scoreboard.ts'),
    '@slipsurge/core':path.join(root,'packages/core/src'),
   }
   const replacements:Record<string,string>={
    [path.join(root,'src/lib/supabase/admin')]:path.join(root,'review/admin.ts'),
    [path.join(root,'src/lib/nbaPaintData')]:path.join(root,'review/nba.ts'),
    [path.join(root,'src/lib/nbaResearchResources')]:path.join(root,'review/nba-resources.ts'),
    [path.join(root,'src/lib/nbaSharedCache')]:path.join(root,'review/cache.ts'),
    [path.join(root,'src/app/the-sideline/data')]:path.join(root,'review/nfl.ts'),
    [path.join(root,'src/lib/nflTouchdownFeed')]:path.join(root,'review/nfl.ts'),
   }
   result.plugins.push(new context.webpack.NormalModuleReplacementPlugin(/^@slipsurge\/core\/espn-api$/, (resource:{request:string})=>{
    resource.request=path.join(root,'review/scoreboard.ts')
   }))
   result.plugins.push(new context.webpack.NormalModuleReplacementPlugin(/(?:supabase[/\\]admin|nbaPaintData|nbaResearchResources|nbaSharedCache|nflTouchdownFeed|[./]data)(?:\.ts)?$/, (resource:any)=>{
    const target=(resource.request.startsWith('@/')?path.join(root,'src',resource.request.slice(2)):path.resolve(resource.context,resource.request)).replace(/\.tsx?$/,'')
    if(replacements[target])resource.request=replacements[target]
   }))
   return result
  },
  async headers(){return [...await base.headers?.()??[],{source:'/(.*)',headers:[
   {key:'X-Robots-Tag',value:'noindex, nofollow, noarchive'},
   {key:'X-SlipSurge-Review',value:'local-fixtures-only'},
   {key:'Content-Security-Policy',value:"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https://a.espncdn.com https://cdn.nba.com https://static.www.nfl.com https://img.mlbstatic.com; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; frame-src 'self'; media-src 'self' blob:; form-action 'self'; base-uri 'self'"},
  ]}]},
 }: {})}
}
