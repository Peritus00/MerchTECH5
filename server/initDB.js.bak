
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initializeDatabase() {
  try {
    console.log('Initializing database...');
    
    // Read and execute migration file
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '../database/migrations/001_create_tables.sql'),
      'utf8'
    );
    
    await pool.query(migrationSQL);
    console.log('Database initialized successfully!');
    
  } catch (error) {
    console.error('Database initialization error:', error);
  } finally {
    await pool.end();
  }
}

initializeDatabase();
