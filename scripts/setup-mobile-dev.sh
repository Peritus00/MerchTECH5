#!/bin/bash

# MerchTech Mobile Development Setup Script
# This script helps configure the API URL for mobile device testing

echo "🔧 MerchTech Mobile Development Setup"
echo "======================================"

# Get the local IP address
LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)

if [ -z "$LOCAL_IP" ]; then
    echo "❌ Could not determine local IP address"
    echo "Please manually find your IP address and set EXPO_PUBLIC_API_URL"
    exit 1
fi

echo "🔍 Detected local IP address: $LOCAL_IP"
echo ""

# Construct the API URL
API_URL="http://$LOCAL_IP:5001/api"

echo "📱 For mobile development, set this environment variable:"
echo "EXPO_PUBLIC_API_URL=$API_URL"
echo ""

echo "🚀 To start Expo with mobile support:"
echo "EXPO_PUBLIC_API_URL=$API_URL npx expo start --clear"
echo ""

echo "📋 Copy and paste this command to start your development server:"
echo "EXPO_PUBLIC_API_URL=$API_URL npx expo start --clear"
echo ""

echo "✅ Make sure your backend server is running on port 5001"
echo "✅ Make sure your mobile device is on the same WiFi network"
echo "✅ Make sure your firewall allows connections on port 5001"
