const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Disable watchman to avoid permission issues
config.watchFolders = [];
config.resolver.useWatchman = false;

// jspdf's `main` field points to jspdf.node.min.js which is absent in production
// npm installs. Redirect all `jspdf` imports to the UMD browser build instead.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'jspdf') {
    return {
      filePath: path.resolve(__dirname, 'node_modules/jspdf/dist/jspdf.umd.min.js'),
      type: 'sourceFile',
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
