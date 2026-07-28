import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  },
};

export default nextConfig;
