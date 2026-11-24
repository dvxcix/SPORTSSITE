# MacBook setup

## Use the same Cloud workspace first

1. Update Codex/ChatGPT on both computers and use the same account and workspace.
2. In a new Codex chat select **Work in > Cloud**, then the **SlipSurge** saved
   environment once it is published. Open an existing Cloud chat to continue
   its exact files and conversation; a new chat gets a separate workspace.
3. Ask it to read `AGENTS.md`, `docs/workspace/CONTEXT.md`, the task handoff and
   the current checklist. Have it checkpoint and push its branch before you
   resume that work in a local checkout.

## Install a local checkout for web and iOS development

Install Git (Apple's Command Line Tools provide it) and Node 24.11.1 with its
bundled npm 11.6.2. The repository's `.node-version` records the tested version.
A newer npm rejected entries in the existing lockfile during Cloud setup; use
the tested toolchain rather than regenerating the lockfile or overriding peers.
Authenticate to GitHub as an account that can access `dvxcix/SPORTSSITE`.
If HTTPS clone requests credentials, use GitHub's supported browser/credential
manager flow or GitHub Desktop; do not enter a GitHub password as a Git token.

In Terminal:

```sh
mkdir -p ~/Developer
cd ~/Developer
git clone https://github.com/dvxcix/SPORTSSITE.git
cd SPORTSSITE
node scripts/workspace.mjs setup
node scripts/workspace.mjs verify
```

In Codex choose **Add project**, select `~/Developer/SPORTSSITE`, and name it
**SlipSurge**. Select the repository root, not only `hub/`, so root guidance and
handoff notes are discovered. Then ask:

> Read AGENTS.md and docs/workspace/CONTEXT.md. Run the workspace status check,
> fetch current main, and continue the specified task in a separate codex/
> branch. Preserve any existing local changes. Keep the checklist and task
> handoff current, and push a checkpoint before switching computers.

For the safe web preview:

```sh
npm --prefix hub run dev:ui-review
```

Open `http://127.0.0.1:4180/design-review`. These are labeled fixture pages, not
live production data. The review launcher refuses service `.env` files and
removes service credentials from its child process. Use a clean review checkout.

## Bring changes back to this PC

Before leaving the Mac, review and commit only your task files plus its handoff,
then `git push -u origin HEAD`. On this PC fetch, select that same branch in a
clean checkout/worktree and run `node scripts/workspace.mjs sync`. The same
process works in the opposite direction. Neither device needs the same path.
The helper stops rather than discarding unsaved work or merging divergence.

## Existing chats and exact PC tools

For this PC's existing local chats use remote connections, if exposed in your
app: on the PC, **Settings > Connections > Control this Mac or PC**; on the Mac,
**Settings > Connections > Control other devices**. Complete the pairing and
security prompts yourself. Keep the host awake, online and the app running.
This accesses the PC; it does not copy its files or chats onto the Mac.

## iOS

Install full Xcode from Apple, open it once, complete its license/component
setup and install the iOS Simulator runtime. These interactive Apple steps must
be completed on the Mac. The existing scaffold is `hub/mobile/`; it is not yet
certified as a finished iOS product. When the iOS task begins, inspect its
current dependencies and app configuration before running:

```sh
cd hub
npm run ios --workspace mobile
```

Native builds/simulator run on the Mac. Commit portable app source back into
this repository so PC and Cloud tasks see it after fetching. Provision Apple
signing credentials separately; never commit certificates, tokens or keychains.

## What this does not copy

Uncommitted files on other hosts, personal plugins/skills, local browser sign-ins,
`.env` values and historical Codex chats are not imported by cloning GitHub.
Before retiring the PC, make a private backup and review its local-only work.
See the preservation note in the shared workspace guide.
