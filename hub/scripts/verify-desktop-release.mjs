import { access, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const config = JSON.parse(await readFile(path.join(root, 'desktop', 'src-tauri', 'tauri.conf.json'), 'utf8'))
const cargo = await readFile(path.join(root, 'desktop', 'src-tauri', 'Cargo.toml'), 'utf8')
const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1]

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(config.version)) {
  throw new Error(`Invalid desktop version: ${config.version}`)
}
if (cargoVersion !== config.version) {
  throw new Error(`Desktop version mismatch: tauri.conf.json=${config.version}, Cargo.toml=${cargoVersion || 'missing'}`)
}

const targetRoot = process.env.CARGO_TARGET_DIR
  ? path.resolve(process.env.CARGO_TARGET_DIR)
  : path.join(root, 'desktop', 'src-tauri', 'target')
const installer = path.join(targetRoot, 'release', 'bundle', 'nsis', `SlipSurge_${config.version}_x64-setup.exe`)
const signature = `${installer}.sig`
await Promise.all([access(installer), access(signature)])

const [{ size }, signatureText] = await Promise.all([stat(installer), readFile(signature, 'utf8')])
if (size < 1_000_000) throw new Error(`Desktop installer is unexpectedly small: ${size} bytes`)
if (signatureText.trim().length < 40) throw new Error('Desktop updater signature is missing or malformed')

console.log(`Verified SlipSurge ${config.version} installer (${Math.round(size / 1_048_576)} MB) and updater signature.`)
