const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Disable watchman to avoid permission issues
config.watchFolders = [];
config.resolver.useWatchman = false;

// Exclude jspdf.node.min.js from bundling (it's web-only and uses AMD requires that Metro doesn't support)
// jspdf is only used on web platform and is conditionally required
config.resolver.blockList = [
  /node_modules\/jspdf\/dist\/jspdf\.node\.min\.js$/,
];

module.exports = config; 