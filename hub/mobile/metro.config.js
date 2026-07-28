// Monorepo config (Expo's own documented pattern for npm workspaces) — by
// default Metro only watches this app's own directory and resolves
// node_modules by walking up from here, so it never sees @slipsurge/core,
// which npm workspaces symlinks into hub/node_modules (one level up), not
// mobile/node_modules. watchFolders makes Metro aware of the whole
// workspace root; nodeModulesPaths + disableHierarchicalLookup point
// resolution at hub/node_modules explicitly instead of Metro's own
// upward-walk (which would otherwise stop at the first node_modules it
// finds and miss the hoisted workspace packages).
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
config.resolver.disableHierarchicalLookup = true

module.exports = config
