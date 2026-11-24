# SlipSurge

The shared repository for SlipSurge's web app, mobile workspace and project history.
Production: [www.slipsurge.com](https://www.slipsurge.com).

Start with [the workspace guide](docs/workspace/README.md),
[current context](docs/workspace/CONTEXT.md) and [AGENTS.md](AGENTS.md).

- [MacBook setup and switching computers](docs/workspace/MACBOOK.md)
- [Codex Cloud setup](docs/workspace/CLOUD.md)
- [Current UI/UX checklist](hub/docs/design/page-by-page-checklist.txt)
- [Release and operations checklist](hub/docs/operations/release-checklist.md)

From the repository root, with Node 24 installed:

```sh
node scripts/workspace.mjs setup
node scripts/workspace.mjs verify
npm --prefix hub run dev:ui-review
```

The private review uses labeled fixtures and no production credentials. The web
application and npm workspaces live in `hub/`; the mobile workspace is
`hub/mobile/`. Read the workspace guide before using production integrations.
