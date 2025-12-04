#!/bin/bash
# EAS Build hook to copy ProGuard/R8 mapping.txt file to artifacts
# This ensures the mapping file is available for download and can be uploaded to Google Play Console

set -e

echo "🔍 Looking for mapping.txt file..."

# Check for mapping file in the standard Android build output location
MAPPING_FILE="android/app/build/outputs/mapping/release/mapping.txt"

if [ -f "$MAPPING_FILE" ]; then
  echo "✅ Found mapping.txt at: $MAPPING_FILE"
  
  # Create artifacts directory in project root
  ARTIFACTS_DIR="./build-artifacts"
  mkdir -p "$ARTIFACTS_DIR"
  
  # Copy mapping file to artifacts directory
  cp "$MAPPING_FILE" "$ARTIFACTS_DIR/mapping.txt"
  
  echo "✅ Mapping file copied to $ARTIFACTS_DIR/mapping.txt"
  echo "📦 File size: $(du -h "$ARTIFACTS_DIR/mapping.txt" | cut -f1)"
else
  echo "⚠️  Mapping file not found at: $MAPPING_FILE"
  echo "🔍 Searching for mapping files in alternative locations..."
  
  # Try to find mapping file in other possible locations
  find android/app/build/outputs -name "mapping.txt" 2>/dev/null | while read -r found_file; do
    if [ -f "$found_file" ]; then
      echo "✅ Found mapping.txt at: $found_file"
      ARTIFACTS_DIR="./build-artifacts"
      mkdir -p "$ARTIFACTS_DIR"
      cp "$found_file" "$ARTIFACTS_DIR/mapping.txt"
      echo "✅ Mapping file copied to $ARTIFACTS_DIR/mapping.txt"
      exit 0
    fi
  done
  
  echo "❌ No mapping.txt file found. R8/ProGuard may not have run, or the build type is different."
  echo "   This is normal for development builds, but production builds should generate this file."
fi

