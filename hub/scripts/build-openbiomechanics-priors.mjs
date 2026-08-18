import fs from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
  const out = {}
  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.*)$/)
    if (match) out[match[1]] = match[2]
  }
  return out
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1 }
      else quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(cell.trim()); cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell.trim()); cell = ''
      if (row.some(value => value !== '')) rows.push(row)
      row = []
    } else cell += char
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row) }
  const headers = rows.shift() ?? []
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
}

const number = value => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function solve(matrix, vector) {
  const size = vector.length
  const augmented = matrix.map((row, index) => [...row, vector[index]])
  for (let col = 0; col < size; col += 1) {
    let pivot = col
    for (let row = col + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivot][col])) pivot = row
    }
    ;[augmented[col], augmented[pivot]] = [augmented[pivot], augmented[col]]
    const divisor = augmented[col][col] || 1e-9
    for (let j = col; j <= size; j += 1) augmented[col][j] /= divisor
    for (let row = 0; row < size; row += 1) {
      if (row === col) continue
      const factor = augmented[row][col]
      for (let j = col; j <= size; j += 1) augmented[row][j] -= factor * augmented[col][j]
    }
  }
  return augmented.map(row => row[size])
}

function fitRidge(samples, featureNames, targetName, lambda = 0.1) {
  const width = featureNames.length + 1
  const xtx = Array.from({ length: width }, () => Array(width).fill(0))
  const xty = Array(width).fill(0)
  for (const sample of samples) {
    const x = [1, ...featureNames.map(name => sample[name])]
    for (let i = 0; i < width; i += 1) {
      xty[i] += x[i] * sample[targetName]
      for (let j = 0; j < width; j += 1) xtx[i][j] += x[i] * x[j]
    }
  }
  for (let i = 1; i < width; i += 1) xtx[i][i] += lambda
  const coefficients = solve(xtx, xty)
  return {
    intercept: coefficients[0],
    coefficients: Object.fromEntries(featureNames.map((name, index) => [name, coefficients[index + 1]])),
    predict: sample => coefficients[0] + featureNames.reduce((sum, name, index) => sum + coefficients[index + 1] * sample[name], 0),
  }
}

function metrics(samples, model, targetName) {
  if (!samples.length) return { n: 0, mae: null, rmse: null, r2: null }
  const mean = samples.reduce((sum, row) => sum + row[targetName], 0) / samples.length
  let abs = 0, squared = 0, total = 0
  for (const sample of samples) {
    const error = sample[targetName] - model.predict(sample)
    abs += Math.abs(error); squared += error ** 2; total += (sample[targetName] - mean) ** 2
  }
  return { n: samples.length, mae: abs / samples.length, rmse: Math.sqrt(squared / samples.length), r2: total ? 1 - squared / total : null }
}

function groupedCrossValidation(samples, featureNames, targetName, groups = 5) {
  const folds = Array.from({ length: groups }, () => [])
  const users = [...new Set(samples.map(row => row.user))].sort()
  users.forEach((user, index) => folds[index % groups].push(user))
  const results = []
  for (const heldOut of folds) {
    const held = new Set(heldOut)
    const train = samples.filter(row => !held.has(row.user))
    const test = samples.filter(row => held.has(row.user))
    results.push(metrics(test, fitRidge(train, featureNames, targetName), targetName))
  }
  const valid = results.filter(result => result.n)
  return Object.fromEntries(['mae', 'rmse', 'r2'].map(key => [key, valid.reduce((sum, result) => sum + (result[key] ?? 0), 0) / valid.length]))
}

function quantile(values, p) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  const index = (sorted.length - 1) * p
  const lower = Math.floor(index), upper = Math.ceil(index)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

function correlation(rows, xName, yName) {
  const pairs = rows.map(row => [row[xName], row[yName]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
  if (pairs.length < 30) return null
  const mx = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length
  const my = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length
  let numerator = 0, dx = 0, dy = 0
  for (const [x, y] of pairs) { numerator += (x - mx) * (y - my); dx += (x - mx) ** 2; dy += (y - my) ** 2 }
  return { feature: xName, r: numerator / Math.sqrt(dx * dy), n: pairs.length }
}

const args = parseArgs(process.argv)
if (!args.source || !args.output || !args.revision) {
  throw new Error('Usage: node build-openbiomechanics-priors.mjs --source=<repo> --output=<json> --revision=<commit>')
}

const hitting = path.join(args.source, 'baseball_hitting')
const poi = parseCsv(fs.readFileSync(path.join(hitting, 'data/poi/poi_metrics.csv'), 'utf8'))
const metadata = parseCsv(fs.readFileSync(path.join(hitting, 'data/metadata.csv'), 'utf8'))
const hittrax = parseCsv(fs.readFileSync(path.join(hitting, 'data/poi/hittrax.csv'), 'utf8'))
const metaBySwing = new Map(metadata.map(row => [row.session_swing, row]))
const hittraxBySwing = new Map(hittrax.map(row => [row.session_swing, row]))

const swings = poi.map(row => {
  const meta = metaBySwing.get(row.session_swing) ?? {}
  const hit = hittraxBySwing.get(row.session_swing) ?? {}
  const attackAngle = number(row.attack_angle_contact_x)
  const exitVelocity = number(row.exit_velo_mph_x)
  const batSpeed = number(row.bat_speed_mph_contact_x) ?? number(row.blast_bat_speed_mph_x)
  const launchAngle = number(hit.la)
  return {
    ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, number(value)])),
    sessionSwing: row.session_swing,
    user: meta.user || row.session,
    batSpeed,
    attackAngle,
    attackAngleSquared: attackAngle == null ? null : attackAngle ** 2,
    exitVelocity,
    launchAngle,
    launchAngleSquared: launchAngle == null ? null : launchAngle ** 2,
    exitVelocityLaunchAngle: exitVelocity == null || launchAngle == null ? null : exitVelocity * launchAngle,
    distance: number(hit.dist),
  }
})

const transferFeatures = ['batSpeed', 'attackAngle', 'attackAngleSquared']
const transferRows = swings.filter(row => transferFeatures.every(name => Number.isFinite(row[name])) && Number.isFinite(row.exitVelocity))
const transferModel = fitRidge(transferRows, transferFeatures, 'exitVelocity')
const distanceFeatures = ['exitVelocity', 'launchAngle', 'launchAngleSquared', 'exitVelocityLaunchAngle']
const distanceRows = swings.filter(row => distanceFeatures.every(name => Number.isFinite(row[name])) && Number.isFinite(row.distance))
const distanceModel = fitRidge(distanceRows, distanceFeatures, 'distance')

const latentCandidates = [
  'pelvis_angular_velocity_seq_max_x', 'torso_angular_velocity_seq_max_x', 'upper_arm_speed_mag_seq_max_x',
  'hand_speed_mag_seq_max_x', 'x_factor_fp_x', 'x_factor_hs_x', 'bat_torso_angle_connection_x',
  'torso_pelvis_swing_max_x', 'lead_wrist_swing_max_x', 'max_cog_velo_x',
]
const latentAssociations = latentCandidates.map(name => correlation(swings, name, 'exitVelocity')).filter(Boolean).sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
const efficiency = transferRows.map(row => row.exitVelocity / row.batSpeed)

const artifact = {
  schemaVersion: 1,
  modelVersion: 'hr-mechanics-2026.08.18.1',
  generatedAt: new Date().toISOString(),
  source: {
    project: 'Driveline OpenBiomechanics Project',
    repository: 'https://github.com/drivelineresearch/openbiomechanics',
    revision: args.revision,
    license: 'Licensed use; upstream public data is CC BY-NC-SA 4.0 and code is MIT',
    importantLimit: 'Anonymous laboratory swings calibrate population priors only. Full-body values are never imputed as measurements for MLB players.',
  },
  samples: { poiSwings: poi.length, metadataRows: metadata.length, hittraxRows: hittrax.length, transferRows: transferRows.length, distanceRows: distanceRows.length },
  observablePriors: {
    batSpeedMph: { p10: quantile(transferRows.map(row => row.batSpeed), 0.1), median: quantile(transferRows.map(row => row.batSpeed), 0.5), p90: quantile(transferRows.map(row => row.batSpeed), 0.9) },
    attackAngleDegrees: { p10: quantile(transferRows.map(row => row.attackAngle), 0.1), median: quantile(transferRows.map(row => row.attackAngle), 0.5), p90: quantile(transferRows.map(row => row.attackAngle), 0.9) },
    exitVelocityPerBatSpeed: { p10: quantile(efficiency, 0.1), median: quantile(efficiency, 0.5), p90: quantile(efficiency, 0.9) },
  },
  models: {
    exitVelocityTransfer: { target: 'exitVelocityMph', features: transferFeatures, intercept: transferModel.intercept, coefficients: transferModel.coefficients, training: metrics(transferRows, transferModel, 'exitVelocity'), groupedAthleteCv: groupedCrossValidation(transferRows, transferFeatures, 'exitVelocity') },
    carryDistance: { target: 'distanceFeet', features: distanceFeatures, intercept: distanceModel.intercept, coefficients: distanceModel.coefficients, training: metrics(distanceRows, distanceModel, 'distance'), groupedAthleteCv: groupedCrossValidation(distanceRows, distanceFeatures, 'distance') },
  },
  latentAssociations,
}

fs.mkdirSync(path.dirname(args.output), { recursive: true })
fs.writeFileSync(args.output, `${JSON.stringify(artifact, null, 2)}\n`)
console.log(JSON.stringify({ output: args.output, samples: artifact.samples, transferCv: artifact.models.exitVelocityTransfer.groupedAthleteCv, distanceCv: artifact.models.carryDistance.groupedAthleteCv }, null, 2))
