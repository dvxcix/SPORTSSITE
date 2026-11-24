import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { inspectWorkspace, syncWorkspace } from './workspace.mjs'

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'slipsurge-workspace-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  git(root, 'init', '--bare', 'origin.git')
  git(root, 'clone', path.join(root, 'origin.git'), 'first')
  const first = path.join(root, 'first')
  git(first, 'config', 'user.name', 'Workspace Test')
  git(first, 'config', 'user.email', 'workspace@example.test')
  git(first, 'switch', '-c', 'main')
  writeFileSync(path.join(first, 'source.txt'), 'original\n')
  git(first, 'add', 'source.txt')
  git(first, 'commit', '-m', 'Baseline')
  git(first, 'push', '-u', 'origin', 'main')
  git(root, 'clone', '--branch', 'main', path.join(root, 'origin.git'), 'second')
  const second = path.join(root, 'second')
  git(second, 'config', 'user.name', 'Workspace Test')
  git(second, 'config', 'user.email', 'workspace@example.test')
  return { first, second }
}

test('a checkpoint from the other computer fast-forwards without changing branches', t => {
  const { first, second } = fixture(t)
  writeFileSync(path.join(first, 'source.txt'), 'shared checkpoint\n')
  git(first, 'commit', '-am', 'Checkpoint')
  git(first, 'push')
  assert.match(syncWorkspace(second).result, /Synced main/)
  assert.equal(readFileSync(path.join(second, 'source.txt'), 'utf8').replaceAll('\r\n', '\n'), 'shared checkpoint\n')
  assert.equal(inspectWorkspace(second).branch, 'main')
})

test('tracked edits and untracked files are never discarded', t => {
  const { second } = fixture(t)
  writeFileSync(path.join(second, 'source.txt'), 'unsaved\n')
  assert.throws(() => syncWorkspace(second), /Unsaved or untracked/)
  assert.equal(readFileSync(path.join(second, 'source.txt'), 'utf8'), 'unsaved\n')
  git(second, 'commit', '-am', 'Local checkpoint')
  writeFileSync(path.join(second, 'new-file.txt'), 'keep me\n')
  assert.throws(() => syncWorkspace(second), /Unsaved or untracked/)
  assert.equal(readFileSync(path.join(second, 'new-file.txt'), 'utf8'), 'keep me\n')
})

test('divergent device histories stop before any merge or reset', t => {
  const { first, second } = fixture(t)
  writeFileSync(path.join(first, 'source.txt'), 'remote edit\n')
  git(first, 'commit', '-am', 'Remote')
  git(first, 'push')
  writeFileSync(path.join(second, 'source.txt'), 'local edit\n')
  git(second, 'commit', '-am', 'Local')
  const head = git(second, 'rev-parse', 'HEAD')
  assert.throws(() => syncWorkspace(second), /histories diverged/)
  assert.equal(git(second, 'rev-parse', 'HEAD'), head)
  assert.equal(readFileSync(path.join(second, 'source.txt'), 'utf8'), 'local edit\n')
  assert.equal(inspectWorkspace(second).changes, '')
})

test('local commits remain in place and are reported for pushing', t => {
  const { second } = fixture(t)
  writeFileSync(path.join(second, 'source.txt'), 'local checkpoint\n')
  git(second, 'commit', '-am', 'Local checkpoint')
  const head = git(second, 'rev-parse', 'HEAD')
  assert.match(syncWorkspace(second).result, /ahead/)
  assert.equal(git(second, 'rev-parse', 'HEAD'), head)
})

test('detached and unconfigured task branches require an explicit destination', t => {
  const { second } = fixture(t)
  git(second, 'switch', '--detach')
  assert.throws(() => syncWorkspace(second), /Detached checkout/)
  git(second, 'switch', '-c', 'codex/new-task')
  assert.throws(() => syncWorkspace(second), /No origin upstream/)
})
