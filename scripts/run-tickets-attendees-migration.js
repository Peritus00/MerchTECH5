#!/usr/bin/env node
/**
 * Run migration 048_tickets_and_attendees.sql
 * Creates attendees, ticket_types, tickets, and event_ticket_orders tables.
 * Also alters order_items to add product_id.
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const migrationPath = path.join(__dirname, '../database/migrations/048_tickets_and_attendees.sql');
    if (!fs.existsSync(migrationPath)) {
      console.error('❌ Migration file not found:', migrationPath);
      process.exit(1);
    }
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('📝 Running migration: 048_tickets_and_attendees.sql');
    await pool.query(sql);
    console.log('✅ Migration 048 completed successfully');

    const tables = ['attendees', 'ticket_types', 'tickets', 'event_ticket_orders'];
    for (const table of tables) {
      const check = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [table]);
      console.log(`   ${check.rows.length > 0 ? '✓' : '✗'} Table ${table}`);
    }

    const colCheck = await pool.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='order_items' AND column_name='product_id'
    `);
    console.log(`   ${colCheck.rows.length > 0 ? '✓' : '✗'} Column order_items.product_id`);
  } catch (err) {
    console.error('❌ Migration 048 failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
