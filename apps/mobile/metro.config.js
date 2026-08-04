const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
// npm workspaces monorepo: packages/shared lives outside this app's own
// directory, and npm hoists shared deps (react, etc.) to the repo root's
// node_modules — Metro's default config only looks inside projectRoot, so
// without this it can't resolve @matos/shared or anything hoisted.
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
  // nativewind depends on react-native-css-interop, which needs a React 19
  // -compatible react-native — since the monorepo root's own react/react-native
  // are pinned to apps/web's React 18, npm nests a private copy of that whole
  // chain under nativewind's own node_modules rather than hoisting it. An
  // explicit nodeModulesPaths list (needed for the monorepo setup above)
  // replaces Metro's default per-file hierarchical walk, so without this
  // entry that nested copy is otherwise unreachable.
  path.resolve(monorepoRoot, "node_modules/nativewind/node_modules"),
];

module.exports = withNativeWind(config, { input: "./src/global.css" });
