const express = require('express');
const app = express();
// Using a new port to bypass any environment-level blocking
const PORT = 3001; 

// A simple logger to see incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Received: ${req.method} ${req.originalUrl}`);
  next();
});

// The ONLY route defined on the server
app.post('/api/auth/login', (req, res) => {
  console.log('✅✅✅ SUCCESS! The /api/auth/login route was reached!');
  res.status(200).json({ message: 'Login successful on port 3001!' });
});

// A simple 404 handler for any other route
app.use((req, res) => {
  console.log(`❌ 404: Route not found for ${req.originalUrl}`);
  res.status(404).json({ error: 'Route not found' });
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 ============================================');
  console.log(`🚀 PORT TEST SERVER RUNNING ON PORT ${PORT}`);
  console.log('🚀 ============================================');
});
