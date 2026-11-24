# SlipSurge Codex Cloud environment

Repository: `dvxcix/SPORTSSITE`. Project folder: repository root. App folder:
`hub/`. Runtime: Node 24.11.1 with bundled npm 11.6.2, recorded in `.node-version`.
Keep this tested toolchain: a newer npm rejected entries in the current lockfile.
Do not regenerate the lockfile or add a legacy-peer-deps override to hide that.

**Published and runnable, 24 November 2026:** select **Work in > Cloud > SlipSurge**.
The private environment has the tested install/start instructions and main
repository binding. See [the setup receipt](handoffs/2026-11-24-cloud-setup.md)
for verification and remaining external integration limits. The creation steps
below are retained for recovery or deliberate rebuilding; do not create a second
environment just to start a new chat.

## Reusable setup

Use **Settings > Codex Cloud > Environments > Create environment**, select only
`dvxcix/SPORTSSITE`, and complete the repository's setup. Name the saved
environment **SlipSurge**. Repository access must use the authorized GitHub
connection; no private token belongs in a prompt or a checked-in file.

Use this setup instruction:

> Prepare this repository for SlipSurge web development. Read AGENTS.md and
> docs/workspace/CONTEXT.md. Use Node 24 and the existing hub/package-lock.json;
> run node scripts/workspace.mjs setup, then node scripts/workspace.mjs verify.
> Run the credential-free private UI review and check /design-review. Preserve
> all instructions/checklist and use codex/ task branches. Do not modify app
> features, deploy, run collectors, apply migrations, send messages, perform
> payments or request production secrets. Save the tested install/start setup
> and publish a private reusable environment named SlipSurge. Report any step
> that was not actually verified.

The reusable install command is:

```sh
node scripts/workspace.mjs setup
```

Verification:

```sh
node scripts/workspace.mjs verify
```

The private review start command is:

```sh
npm --prefix hub run dev:ui-review
```

It starts on `127.0.0.1:4180`; inspect `/design-review` using the Cloud browser.
Stop it when no longer needed. Do not expose fixture review to production or
turn on production feature flags to make it render.

## Persistence and changes

Publish after the tested configuration is saved. A published environment is a
reusable starting setup; existing Cloud chats retain their own files. New chats
do not inherit another chat's uncommitted changes. Use GitHub checkpoints and
handoff notes between chats/devices. Fetch current main at the start of a task.

Cloud setup does not import this PC's past chats, secrets, browser cookies,
plugins or local worktrees. No production service credentials are necessary for
the initial source tests and private UI review. Add narrowly scoped credentials
later only for an explicitly authorized integration task, using the appropriate
environment/personal secret vault, never in source or prompts.

Official guides: [Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments),
[remote connections](https://learn.chatgpt.com/docs/remote-connections).
