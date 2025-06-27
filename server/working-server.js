const express = require('express');
const app = express();
const PORT = 5001;

// Only use the most essential middleware for this test.
app.use(express.json());

// A simple logger to see incoming requests.
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Received ${req.method} request for ${req.originalUrl}`);
  next();
});

// The ONLY route defined on the server.
app.post('/api/auth/login', (req, res) => {
  console.log('✅ SUCCESS: The /api/auth/login route was correctly matched!');
  console.log('Received login data:', req.body);

  // Send back a simple success response.
  res.status(200).json({
    message: 'Login route successfully reached!',
    user: { email: req.body.email },
    token: 'test-token-from-minimal-server'
  });
});

// A simple 404 handler for any other route.
app.use((req, res, next) => {
  console.log(`❌ 404: Route not found for ${req.originalUrl}`);
  res.status(404).json({ error: 'Route not found' });
});

// Start the server.
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 ============================================');
  console.log(`🚀 MINIMAL test server is running on port ${PORT}`);
  console.log('🚀 ============================================');
});
