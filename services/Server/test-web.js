const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = 5002;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/merchtech_db'
});

// Middleware
app.use(express.json());
app.use(express.static('uploads'));

// Test route
app.get('/test', (req, res) => {
  res.send('<h1>Web server is working!</h1>');
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Test web server running on port ${PORT}`);
}); 