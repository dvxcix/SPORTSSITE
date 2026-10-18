# SlipSurge baseline guard

Before editing, read `../AGENTS.md`. This app must retain the verified live baseline commit `6c3811b0882e1b1a6694a30849273f3e210cd69c`; GitHub main alone was missing deployed NFL game-center code. Start new task branches and worktrees from `laptop/live-baseline` or a verified descendant.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
