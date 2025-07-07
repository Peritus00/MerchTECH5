#!/bin/bash

# Set environment variables for testing
export API_URL="http://localhost:5001"  # Local development server
export NODE_ENV="test"

# Run the tests
echo "🧪 Running system functionality tests..."
node test-system-functionality.js

# Check the exit code
if [ $? -eq 0 ]; then
    echo "✅ All tests completed successfully!"
else
    echo "❌ Some tests failed. Check the output above for details."
    exit 1
fi 