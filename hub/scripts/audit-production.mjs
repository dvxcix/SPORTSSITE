import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const allowedAdvisories = new Set([
  'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr',
  'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq',
  'https://github.com/advisories/GHSA-w5hq-g745-h8pq',
])

function fail(message) {
  console.error(`[production-audit] ${message}`)
  process.exit(1)
}

async function requireSourceGuard(path, guard) {
  let source
  try {
    source = await readFile(path, 'utf8')
  } catch (error) {
    fail(`Unable to inspect ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (!source.includes(guard)) {
    fail(`Local mitigation is missing from ${path}`)
  }
}

const npmExecutable = process.env.npm_execpath
const command = npmExecutable ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm'
const args = npmExecutable
  ? [npmExecutable, 'audit', '--omit=dev', '--json']
  : ['audit', '--omit=dev', '--json']
const result = spawnSync(command, args, {
  cwd: process.cwd(),
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
  shell: false,
})

if (result.error) {
  fail(`npm audit could not run: ${result.error.message}`)
}

let report
try {
  report = JSON.parse(result.stdout || '{}')
} catch {
  fail(`npm audit returned malformed JSON${result.stderr ? `: ${result.stderr.trim()}` : ''}`)
}

if (report.error) {
  fail(`npm audit failed: ${report.error.summary || report.error.message || 'unknown registry error'}`)
}

const vulnerabilities = report.vulnerabilities || {}

function advisoryUrlsFor(packageName, trail = new Set()) {
  if (trail.has(packageName)) {
    return new Set()
  }

  const vulnerability = vulnerabilities[packageName]
  if (!vulnerability) {
    fail(`npm audit references missing vulnerability metadata for ${packageName}`)
  }

  const nextTrail = new Set(trail).add(packageName)
  const urls = new Set()

  for (const via of vulnerability.via || []) {
    if (typeof via === 'string') {
      for (const url of advisoryUrlsFor(via, nextTrail)) urls.add(url)
      continue
    }

    if (!via || typeof via !== 'object' || typeof via.url !== 'string') {
      fail(`npm audit returned unrecognized advisory data for ${packageName}`)
    }
    urls.add(via.url)
  }

  if (trail.size === 0 && urls.size === 0) {
    fail(`No root advisory could be resolved for ${packageName}`)
  }

  return urls
}

const observedAdvisories = new Set()
for (const packageName of Object.keys(vulnerabilities)) {
  for (const url of advisoryUrlsFor(packageName)) observedAdvisories.add(url)
}

const unexpected = [...observedAdvisories].filter((url) => !allowedAdvisories.has(url))
if (unexpected.length > 0) {
  fail(`Unmitigated production advisories detected: ${unexpected.join(', ')}`)
}

await requireSourceGuard('node_modules/image-size/dist/types/icns.js', 'Invalid ICNS entry length')
await requireSourceGuard('node_modules/image-size/dist/types/jxl.js', 'Invalid JXL box size')
for (const path of [
  'node_modules/uuid/dist/v35.js',
  'node_modules/uuid/dist/esm-node/v35.js',
  'node_modules/uuid/dist/esm-browser/v35.js',
]) {
  await requireSourceGuard(path, 'Number.isSafeInteger(off)')
  await requireSourceGuard(path, 'UUID buffer is too small')
}

console.log(
  observedAdvisories.size === 0
    ? '[production-audit] No production dependency advisories reported.'
    : `[production-audit] ${observedAdvisories.size} known transitive advisories are locally mitigated and guarded.`,
)
