# One SlipSurge project, two development computers

Owner direction, 25 November 2026: retain the Windows PC as the web/Android hub
and use the adjacent Mac for iOS/Xcode. Maintain shared product context and saved
progress across both. The owner should not have to manually reconstruct each
task's context or remember Git commands to transfer a reviewed checkpoint.

## Roles and shared state

| Location | Role | Continuity |
| --- | --- | --- |
| Windows local checkout | Existing website and Android work | Keep its current work safe; use a dedicated task branch and pushed handoff. Current local state cannot be inferred from Cloud. |
| Mac local checkout | iOS source, Xcode, Simulator and device checks | Same GitHub repository; a separate task branch. Xcode must run here. Local setup is not yet verified from this conversation. |
| This Cloud chat | Shared Cloud task files and conversation | Opening this same chat from either computer accesses this same remote workspace, not the local Windows/Mac files. |
| GitHub | Saved source, context, task handoffs and checkpoint history | Pushing makes a checkpoint available; the other session must fetch/read it before claiming it has received it. |

Codex apps being open on both devices does not itself synchronize separate
local chats, unsaved buffers, installed tools, credentials or uncommitted files.
This is a checkpoint workflow, not an always-running synchronization service.
Do not promise zero loss or 24/7 live mirroring. Private device backups remain
necessary for files outside the reviewed Git checkpoints.

## Agent responsibilities

1. Establish the actual execution host and checkout. Read root instructions,
   CONTEXT.md, this file, the current task handoff and any related task handoff.
   Inspect status before touching files; retain all unrelated local work.
2. Fetch relevant GitHub refs before starting dependent work. Use each task's
   existing branch when resuming, or a separate codex/ branch for new work.
   Do not run the same task branch concurrently on both local computers.
3. At each meaningful milestone, update the task-specific handoff with decisions,
   current branch, relevant source checkpoint, completed/uncompleted behavior,
   checks, blockers, shared API/schema changes and next steps. Review and commit
   only named task files, then push and verify success. Do not silently batch an
   entire working directory or include local credentials/session data.
4. Before working on shared APIs, auth, data contracts or design tokens, read the
   related web/Android/iOS task's latest pushed handoff. Coordinate compatible
   changes through reviewed source; branch separation does not remove integration
   work. Never change an existing production contract just to satisfy one client.
5. A dirty checkout stays in place. Fetch/read another branch's handoff without
   switching or overwriting files. Divergence or a rejected push needs inspection
   and reconciliation, never force-push, hard reset or automatic background pull.
6. Report the checkpoint available on GitHub separately from receipt on another
   device. A pushed branch does not establish that the other local checkout has
   fetched it. No session can inspect or control another computer just because
   it runs the same Codex account.

Agent-run fetch/checkpoint steps are routine work within the authorized task;
do not repeatedly ask the owner to approve them. Production releases, migrations,
jobs and messaging retain their separate authorization boundaries in AGENTS.md.

## Current iOS handoff

- Branch: `codex/ios-parity-20261125`
- Audit checkpoint: `9dcf9d43cd0b9c6183952dc47fd027fb632d7e7c`
- Handoff: `docs/workspace/handoffs/2026-11-25-ios-parity.md`
- Product baseline and source inventory: `docs/ios/README.md`
- Status: source/parity audit completed; no native app build verified. The owner
  reports downloading/opening Xcode. Framework choice and local Mac build setup
  still need resolution in the Mac session.

For an agent on another branch, read the iOS handoff without changing that
checkout. The explicit fetch also works when the clone fetches only main:

```sh
git fetch origin refs/heads/codex/ios-parity-20261125:refs/remotes/origin/codex/ios-parity-20261125
git show origin/codex/ios-parity-20261125:docs/workspace/handoffs/2026-11-25-ios-parity.md
```

The Windows session should record its actual current web/Android task branch in
its own handoff; do not invent one from an old recovery checkpoint. See README.md
for preserved PC work and MACBOOK.md for the Mac-local setup. The new device
workflow is on the iOS task branch until reviewed into main; sessions on main
must read this remote copy explicitly to use it now.
