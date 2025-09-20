#!/usr/bin/env node

/**
 * Apply Responsive Improvements Script
 * Helps identify and suggest improvements for mobile scaling
 */

const fs = require('fs');
const path = require('path');

console.log('🎯 Mobile Optimization Analysis');
console.log('===============================\n');

// Files to analyze for mobile optimization opportunities
const componentsToCheck = [
  'app/(tabs)/index.tsx',
  'app/(tabs)/media.tsx',
  'app/(tabs)/playlists.tsx',
  'app/(tabs)/store.tsx',
  'components/MediaPlayer.tsx',
  'components/PlaylistPlayer.tsx',
];

const issues = {
  hardcodedDimensions: [],
  fixedFontSizes: [],
  nonResponsiveLayouts: [],
  missingTouchTargets: [],
};

const suggestions = [];

function analyzeFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${filePath}`);
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    console.log(`📁 Analyzing: ${filePath}`);

    // Check for hardcoded dimensions
    const dimensionRegex = /Dimensions\.get\(['"]window['"]\)/g;
    const widthRegex = /width:\s*\d+/g;
    const heightRegex = /height:\s*\d+/g;
    const fontSizeRegex = /fontSize:\s*\d+/g;
    const paddingRegex = /padding:\s*\d+/g;

    if (dimensionRegex.test(content)) {
      issues.hardcodedDimensions.push(filePath);
      console.log(`  ⚠️  Uses Dimensions.get() - consider useResponsive hook`);
    }

    if (fontSizeRegex.test(content)) {
      issues.fixedFontSizes.push(filePath);
      console.log(`  ⚠️  Uses fixed font sizes - consider ResponsiveText`);
    }

    if (widthRegex.test(content) || heightRegex.test(content)) {
      issues.nonResponsiveLayouts.push(filePath);
      console.log(`  ⚠️  Uses fixed dimensions - consider responsive scaling`);
    }

    if (paddingRegex.test(content)) {
      console.log(`  ⚠️  Uses fixed padding - consider responsive padding`);
    }

    // Check for missing responsive patterns
    if (!content.includes('useResponsive') && !content.includes('ResponsiveContainer')) {
      console.log(`  💡 Could benefit from responsive components`);
      suggestions.push({
        file: filePath,
        suggestion: 'Consider using ResponsiveContainer and ResponsiveText components'
      });
    }

    console.log('');

  } catch (error) {
    console.error(`❌ Error analyzing ${filePath}:`, error.message);
  }
}

// Analyze each component
componentsToCheck.forEach(analyzeFile);

// Summary
console.log('📊 Analysis Summary');
console.log('==================');
console.log(`Files with hardcoded dimensions: ${issues.hardcodedDimensions.length}`);
console.log(`Files with fixed font sizes: ${issues.fixedFontSizes.length}`);
console.log(`Files with non-responsive layouts: ${issues.nonResponsiveLayouts.length}`);

if (suggestions.length > 0) {
  console.log('\n💡 Improvement Suggestions:');
  suggestions.forEach(s => {
    console.log(`  - ${s.file}: ${s.suggestion}`);
  });
}

console.log('\n🚀 Quick Start Guide:');
console.log('1. Import responsive utilities:');
console.log('   import { useResponsive } from "@/hooks/useResponsive";');
console.log('');
console.log('2. Replace fixed containers:');
console.log('   <ScrollView> → <ResponsiveContainer>');
console.log('');
console.log('3. Replace fixed text:');
console.log('   <Text style={{fontSize: 18}}> → <ResponsiveText variant="h3">');
console.log('');
console.log('4. Use responsive dimensions:');
console.log('   const { padding, fonts, isSmall } = useResponsive();');
console.log('');
console.log('5. Test on different screen sizes using Expo dev tools');

console.log('\n✅ Next Steps:');
console.log('1. Read MOBILE_OPTIMIZATION_GUIDE.md for detailed instructions');
console.log('2. Start with the most problematic screens first');
console.log('3. Test changes on different device sizes');
console.log('4. Consider adding ZoomControls for dense content');

console.log('\n📱 Expected Benefits:');
console.log('- Better text readability on all screen sizes');
console.log('- Properly sized touch targets');
console.log('- Content that fits within viewport');
console.log('- Improved user experience on mobile devices');
