# One SlipSurge project across computers

GitHub `dvxcix/SPORTSSITE` is the shared source of truth. `main` contains reviewed,
approved work; each active task has its own `codex/` branch. Project context and
the checklist live in this repository so a new chat can pick up the work.

## What is shared

| Item | How it travels |
| --- | --- |
| Code, approved assets, instructions, checklist and handoff notes | Commit and push to GitHub; fetch and pull on the other computer |
| Unfinished code | Commit a checkpoint to its task branch, push, and resume that branch |
| One Cloud chat's files and conversation | Open that same Cloud chat on the other device |
| This PC's existing local chats and tools | Connect to this host using Codex remote connections |
| Credentials, browser sessions, installed packages, local artifacts | Separate setup or a deliberate private backup; never add to Git |

Separate Cloud chats and local clones are separate working directories. They do
not update each other's unsaved files live. Use the same Cloud chat for exact
in-progress continuity, or publish a branch checkpoint before switching hosts.
Cloning the repository does not migrate the old local conversation transcript.

## Start a session

1. Read `AGENTS.md`, `CONTEXT.md`, the relevant checklist entries and the task's
   note in `handoffs/`.
2. Run `node scripts/workspace.mjs status`. This prints paths/status, not file
   contents or credentials.
3. If the checkout is clean, run `node scripts/workspace.mjs sync`. It fetches and
   fast-forwards the current branch from its configured upstream. Dirty,
   untracked, detached, missing-upstream and divergent checkouts stop safely.
4. Start new work from current main in a separate branch/worktree. To continue
   existing work, check out the exact branch in its handoff note.

## Before switching devices

Update a task-specific `docs/workspace/handoffs/<task>.md` with the purpose,
branch, tested behavior, remaining work and any blocked step. Include a known
source commit when useful; do not try to embed a commit's own final hash in
itself. Review `git diff` and stage only named task files:

```sh
git add path/to/reviewed-file docs/workspace/handoffs/my-task.md
git commit -m "Checkpoint: describe the saved work"
git push -u origin HEAD
```

Check that the push succeeded. On the other device:

```sh
git fetch origin
git switch --track origin/codex/my-task
# For an already-existing local branch, switch to it, then:
node scripts/workspace.mjs sync
```

Do not work on the same task branch concurrently on two devices. Use separate
task branches for simultaneous work. A push rejected because another device
advanced the branch is a signal to fetch and reconcile, never to force-push.
Merge reviewed work to main only with the task's release authorization.

## Safeguards

The helper never commits, stages files, resets, deletes files, stashes, rebases,
deploys or writes to the application database. `sync` refuses unsaved work and
uses a fast-forward-only merge. It does not run in the background.

Do not sync a live Git working directory, `node_modules`, `.codex` session
database or `.git` through Dropbox/iCloud/OneDrive. GitHub synchronizes reviewed
source; Codex remote connections expose a particular host's exact environment.
Install personal skills/plugins on each host as needed. Keep portable project
instructions in the repository; authenticate providers separately.

## Existing PC work

The original PC checkout was on `codex/research-data-performance`, behind current
main, with unrelated unfinished tracked changes. It is intentionally preserved
in place. Old worktrees and untracked review files are not assumed to be
published or backed up. The Cloud setup starts from verified main in an isolated
worktree. Before retiring or wiping this PC, review these local-only files and
make a private backup; do not bulk-upload local logs, credentials or browser data.

See [MacBook instructions](MACBOOK.md), [Cloud setup](CLOUD.md) and the
[current context](CONTEXT.md).
