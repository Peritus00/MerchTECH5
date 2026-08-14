#!/usr/bin/env node
/**
 * Dev utility: generate mock attendees and tickets for stress testing.
 *
 * Usage:
 *   node scripts/generate-mock-event-data.js --eventId=1 --count=10000
 *
 * Creates:
 *   - N attendees with random names/emails
 *   - One ticket per attendee assigned to the first ticket type for the event
 *
 * Run against a development database only.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const FIRST_NAMES = ['Alice','Bob','Charlie','Diana','Ethan','Fiona','George','Hannah','Ivan','Julia',
  'Kevin','Laura','Mike','Nina','Oscar','Paula','Quinn','Rachel','Sam','Tina'];
const LAST_NAMES = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Wilson','Moore',
  'Taylor','Anderson','Thomas','Jackson','White','Harris','Martin','Thompson','Young','Lewis'];

function randomName() {
  return `${FIRST_NAMES[Math.floor(Math.random()*FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(Math.random()*LAST_NAMES.length)]}`;
}

function randomEmail(name) {
  return `${name.replace(/\s+/g,'.')}${Math.floor(Math.random()*9999)}@mocktest.example`;
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map(a => a.replace('--','').split('='))
  );
  const eventId = parseInt(args.eventId);
  const count = parseInt(args.count) || 1000;

  if (!eventId) {
    console.error('Usage: node scripts/generate-mock-event-data.js --eventId=<id> --count=<n>');
    process.exit(1);
  }

  console.log(`🔧 Generating ${count} mock attendees for event ${eventId}...`);

  // Get first ticket type for event
  const ttResult = await pool.query(
    'SELECT id, access_level_id, drink_tokens_default, food_tokens_default FROM ticket_types tt JOIN access_levels al ON al.id=tt.access_level_id WHERE tt.event_id=$1 LIMIT 1',
    [eventId]
  );
  if (!ttResult.rows[0]) {
    console.error('❌ No ticket types found for event', eventId, '— create access levels first');
    process.exit(1);
  }
  const ticketType = ttResult.rows[0];
  console.log(`   Using ticket type ${ticketType.id}`);

  const BATCH = 500;
  let inserted = 0;

  for (let i = 0; i < count; i += BATCH) {
    const batchSize = Math.min(BATCH, count - i);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let j = 0; j < batchSize; j++) {
        const name = randomName();
        const email = randomEmail(name).toLowerCase();
        const attendeeResult = await client.query(
          `INSERT INTO attendees (event_id, name, email, source)
           VALUES ($1,$2,$3,'csv')
           ON CONFLICT DO NOTHING RETURNING id`,
          [eventId, name, `${email}_${i+j}`]
        );
        if (attendeeResult.rows[0]) {
          await client.query(
            `INSERT INTO tickets (event_id, attendee_id, ticket_type_id, drink_tokens_remaining, food_tokens_remaining)
             VALUES ($1,$2,$3,$4,$5)`,
            [eventId, attendeeResult.rows[0].id, ticketType.id,
             ticketType.drink_tokens_default || 0, ticketType.food_tokens_default || 0]
          );
          inserted++;
        }
      }
      await client.query('COMMIT');
      process.stdout.write(`\r   ${inserted}/${count} inserted...`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('\n❌ Batch error:', err.message);
    } finally {
      client.release();
    }
  }

  console.log(`\n✅ Done: ${inserted} attendees + tickets created for event ${eventId}`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
