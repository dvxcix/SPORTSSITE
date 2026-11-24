import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { existsSync } from 'node:fs'

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function git(root, args, optional = false) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0 && !optional) throw new Error(`Git ${args[0]} failed: ${(result.stderr || '').trim()}`)
  return { ok: result.status === 0, text: (result.stdout || '').trim() }
}

export function inspectWorkspace(root = repository) {
  git(root, ['rev-parse', '--show-toplevel'])
  return {
    branch: git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], true).text,
    upstream: git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], true).text,
    changes: git(root, ['status', '--porcelain=v1', '--untracked-files=normal']).text,
  }
}

export function syncWorkspace(root = repository) {
  const state = inspectWorkspace(root)
  if (!state.branch) throw new Error('Detached checkout: select the task branch before syncing. No files were changed.')
  if (state.changes) throw new Error('Unsaved or untracked work found. Review it and push a named-file checkpoint before syncing. No files were changed.')
  if (!state.upstream.startsWith('origin/')) throw new Error('No origin upstream. Fetch and select the intended remote task branch, or push your task branch with -u first.')
  git(root, ['fetch', 'origin'])
  // A pure ancestry check prevents git merge from creating conflicts or a merge commit.
  if (!git(root, ['merge-base', '--is-ancestor', 'HEAD', '@{upstream}'], true).ok) {
    if (git(root, ['merge-base', '--is-ancestor', '@{upstream}', 'HEAD'], true).ok) {
      return { ...state, result: 'Local commits are ahead of the upstream. Review and push them; no files were changed.' }
    }
    throw new Error('Local and remote histories diverged. Reconcile in the task branch; no merge, reset or rebase was attempted.')
  }
  git(root, ['merge', '--ff-only', '@{upstream}'])
  return { ...state, result: `Synced ${state.branch} from ${state.upstream}.` }
}

function run(command, args, cwd = repository) {
  // npm's Windows .cmd shim needs a shell. Run its JS entrypoint directly
  // instead, keeping every argument separate and avoiding shell interpolation.
  if (process.platform === 'win32' && command === 'npm') {
    const location = spawnSync('where.exe', ['npm.cmd'], { encoding: 'utf8', windowsHide: true })
    const shim = (location.stdout || '').split(/\r?\n/).find(Boolean)
    const cli = shim && path.join(path.dirname(shim), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    if (!cli || !existsSync(cli)) throw new Error('Cannot locate npm CLI. Install Node 24 with npm on PATH, then retry.')
    command = process.execPath
    args = [cli, ...args]
  }
  const result = spawnSync(command, args, {
    cwd, stdio: 'inherit', windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}.`)
}

export function main(command = 'status') {
  if (command === 'status') {
    const state = inspectWorkspace()
    console.log(`SlipSurge branch: ${state.branch || '(detached)'}`)
    console.log(`Upstream: ${state.upstream || '(none)'}`)
    console.log(state.changes ? `Pending files:\n${state.changes}` : 'Working tree is clean.')
    console.log('Context: docs/workspace/CONTEXT.md; checklist: hub/docs/design/page-by-page-checklist.txt')
    return
  }
  if (command === 'sync') {
    console.log(syncWorkspace().result)
    return
  }
  if (!['setup', 'verify'].includes(command)) throw new Error('Usage: node scripts/workspace.mjs [status|sync|setup|verify]')
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Use Node 24. The tested patch is in .node-version.')
  inspectWorkspace()
  if (command === 'setup') {
    run('npm', ['ci', '--no-audit', '--no-fund'], path.join(repository, 'hub'))
    console.log('Dependencies installed. Next: node scripts/workspace.mjs verify')
    console.log('Private preview: npm --prefix hub run dev:ui-review')
    return
  }
  run(process.execPath, ['--test', 'scripts/workspace.test.mjs'])
  run('npm', ['run', 'test:production'], path.join(repository, 'hub'))
  console.log('Workspace safety and production source checks passed. This is not full integration certification.')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv[2]) } catch (error) { console.error(error.message); process.exitCode = 1 }
}
