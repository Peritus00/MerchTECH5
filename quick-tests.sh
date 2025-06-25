
#!/bin/bash

BASE_URL="https://2baba274-1c74-4233-8964-1b11f1b566fa-00-205iex35lh4nb.kirk.replit.dev:5000/api"

echo "🧪 QUICK PAYMENT SYSTEM TESTS"
echo "=============================="

echo ""
echo "1. Testing Stripe Health Check..."
curl -X GET "$BASE_URL/stripe/health" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || echo "Response received"

echo ""
echo "2. Testing Server Health..."
curl -X GET "$BASE_URL/health" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || echo "Response received"

echo ""
echo "3. Testing Available Routes..."
curl -X GET "$BASE_URL/routes" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || echo "Response received"

echo ""
echo "4. Testing Root Endpoint..."
curl -X GET "https://2baba274-1c74-4233-8964-1b11f1b566fa-00-205iex35lh4nb.kirk.replit.dev:5000/" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || echo "Response received"

echo ""
echo "✅ Quick tests completed!"
echo "Run 'node test-payment-system.js' for comprehensive testing"
