'use strict';
/**
 * In-house provider adapter
 * Reads directly from the local tickets/attendees tables.
 * Used when the event was set up entirely within MerchTrader.
 */

const db = require('../../config/database');

async function fetchRosterPage(connection, cursor) {
  const limit = 500;
  const result = await db.query(
    `SELECT a.name, a.email, a.external_id, a.id AS attendee_id,
            tt.name AS ticket_type
     FROM attendees a
     LEFT JOIN tickets t ON t.attendee_id = a.id AND t.revoked_at IS NULL
     LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
     WHERE a.event_id = $1 AND a.id > $2
     ORDER BY a.id LIMIT $3`,
    [connection.event_id, cursor || 0, limit + 1]
  );

  const hasMore = result.rows.length > limit;
  const tickets = result.rows.slice(0, limit);
  return {
    tickets,
    nextCursor: hasMore ? tickets[tickets.length - 1].attendee_id : null,
  };
}

function getDeltaCursor(lastRun) {
  return lastRun?.cursor || null;
}

module.exports = { fetchRosterPage, getDeltaCursor };
