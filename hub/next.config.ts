import type { NextConfig } from "next";

const privateRoutes = [
  '/admin/:path*',
  '/api/:path*',
  '/auth/:path*',
  '/onboarding',
  '/settings/:path*',
  '/messages/:path*',
  '/notifications',
  '/bookmarks',
  '/picks',
  '/channels/:path*',
  '/dugout',
  '/batter-cost',
  '/pitcher-report',
  '/slate-breakdown',
  '/weather-lab',
  '/synergy',
  '/the-public',
  '/odds-terminal',
  '/daily-recap',
  '/marketplace/:path*',
  '/creators/studio',
  '/creators/payouts',
  '/blog/create/:path*',
  '/blog/edit/:path*',
  '/groups/create',
  '/groups/:slug/settings',
  '/pages/create',
  '/pages/:slug/settings',
  '/stories/create',
  '/events/create',
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'a.espncdn.com' },
      { protocol: 'https', hostname: 'img.mlbstatic.com' },
      { protocol: 'https', hostname: 'www.mlbstatic.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.whop.com' },
    ],
  },
  async headers() {
    return [
      ...privateRoutes.map((source) => ({
        source,
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      })),
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self' https://*.whop.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.ads-twitter.com https://*.whop.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: wss://*.supabase.co; frame-src 'self' https://*.whop.com; media-src 'self' blob: https:; worker-src 'self' blob:; upgrade-insecure-requests",
          },
        ],
      },
    ]
  },
  // @slipsurge/core is a workspace package (packages/core) holding the
  // matrixEngine/batterStatsEngine/etc. logic shared with the mobile app —
  // it ships raw .ts source (no build step of its own), so Next needs to
  // run it through its own compiler same as first-party src/ code, instead
  // of treating it as an already-built external node_modules dependency.
  transpilePackages: ['@slipsurge/core'],
  // playwright-core is already in Next's default server-external-packages
  // list, so it isn't bundled — but Vercel's file tracer (@vercel/nft)
  // still misses browsers.json, a data file the package reads at runtime
  // rather than via a staticly-traceable require. Without this, every route
  // that imports src/lib/browserbase.ts 500s in production with "Cannot
  // find module '.../playwright-core/browsers.json'" despite working fine
  // in a normal `npm run build` + local run. Scoped to just the routes that
  // actually use it (Browserbase automation), not every route on the site.
  outputFileTracingIncludes: {
    '/api/admin/pikkit-context': ['./node_modules/playwright-core/**/*'],
    '/api/cron/scrape-fanduel': ['./node_modules/playwright-core/**/*'],
    '/api/cron/scrape-mgm': ['./node_modules/playwright-core/**/*'],
    '/api/cron/scrape-pikkit': ['./node_modules/playwright-core/**/*'],
    '/api/cron/poll-pikkit-picks': ['./node_modules/playwright-core/**/*'],
    '/api/admin/contact-recap-export': [
      './node_modules/ffmpeg-static/**/*',
      './node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf',
      './public/logo.png',
      './public/sportsbooks/**/*',
    ],
  },
};

export default nextConfig;
