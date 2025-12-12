#!/bin/bash
# Script to regenerate iOS credentials for EAS
# Run this script to regenerate provisioning profile with Sign in with Apple capability

echo "Regenerating iOS credentials for EAS..."
echo "This will prompt you to select options interactively."
echo ""

npx eas-cli credentials --platform ios

echo ""
echo "After regenerating credentials, run:"
echo "npx eas-cli build --platform ios --profile preview"

