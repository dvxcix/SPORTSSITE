import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export function validateProductionAuditReport(report, exitStatus) {
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  if (![0, 1].includes(exitStatus) || !object(report) || !object(report.vulnerabilities) || !object(report.metadata?.vulnerabilities)) {
    throw new Error('npm audit returned incomplete or invalid production vulnerability metadata')
  }
  for (const key of ['info', 'low', 'moderate', 'high', 'critical', 'total']) {
    if (!Number.isSafeInteger(report.metadata.vulnerabilities[key]) || report.metadata.vulnerabilities[key] < 0) {
      throw new Error('npm audit returned invalid production vulnerability counts')
    }
  }
  return report.vulnerabilities
}

// An advisory is treated as mitigated only for these reviewed installed bytes and
// the complete locked inventory. A newly nested copy must be reviewed explicitly.
export async function verifySecurityBackports(root = process.cwd()) {
  const read = async path => readFile(resolve(root, path), 'utf8')
  const manifest = JSON.parse(await read('scripts/security-backports.json'))
  const lock = JSON.parse(await read('package-lock.json'))
  const actual = Object.keys(lock.packages).filter(path => /(?:^|\/)node_modules\/(?:node-forge|zod)$/.test(path)).sort()
  const expected = Object.keys(manifest.packages).sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Security backport inventory differs from the installed lockfile; review every node-forge and Zod copy')
  }
  for (const [path, entry] of Object.entries(manifest.packages)) {
    const installed = JSON.parse(await read(`${path}/package.json`))
    if (lock.packages[path]?.version !== entry.version || installed.version !== entry.version) {
      throw new Error(`Security backport version mismatch: ${path}`)
    }
    for (const [file, expectedHash] of Object.entries(entry.files)) {
      const hash = createHash('sha256').update((await read(`${path}/${file}`)).replace(/\r\n/g, '\n')).digest('hex')
      if (hash !== expectedHash) throw new Error(`Security backport hash mismatch: ${path}/${file}`)
    }
  }
  return manifest.advisories
}
