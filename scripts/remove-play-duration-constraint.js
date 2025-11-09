#!/usr/bin/env node
/**
 * Remove the play_duration >= 30 constraint from media_plays table
 * This allows tracking all play durations, not just those >= 30 seconds
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    console.log('🔄 Removing play_duration constraint from media_plays table...\n');

    const migrationPath = path.join(__dirname, '../database/migrations/023_remove_play_duration_constraint.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    await pool.query(migrationSQL);
    console.log('✅ Successfully removed play_duration constraint from media_plays table');

    // Verify the constraint is removed
    const constraintCheck = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'media_plays' 
      AND constraint_name = 'media_plays_duration_check'
    `);

    if (constraintCheck.rows.length === 0) {
      console.log('✅ Verified: constraint has been removed');
    } else {
      console.log('⚠️  Warning: constraint still exists');
    }

    console.log('\n📊 Now media plays of any duration can be tracked.');
    console.log('   - Total Plays: counts all plays regardless of duration');
    console.log('   - Unique Plays: counts plays > 30 seconds (one per user per media item)');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.message.includes('does not exist')) {
      console.log('ℹ️  Constraint may have already been removed or never existed');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();

