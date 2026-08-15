const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Disable watchman to avoid permission issues
config.watchFolders = [];
config.resolver.useWatchman = false;

// jspdf's `main` field points to jspdf.node.min.js which is absent in production
// npm installs. Redirect all `jspdf` imports to the ES build instead of the UMD
// build because the UMD bundle contains AMD-style require(["html2canvas"], t) calls
// that Metro's static analyser rejects with a SyntaxError.
// The ES build uses ESM dynamic import("html2canvas") which Metro handles correctly.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'jspdf') {
    return {
      filePath: path.resolve(__dirname, 'node_modules/jspdf/dist/jspdf.es.min.js'),
      type: 'sourceFile',
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
