'use strict';
/**
 * CSV provider adapter
 * Reads a previously-uploaded CSV payload stored as a JSON array on the connection.
 * CSV parsing is done client-side with papaparse; the server receives rows as JSON.
 *
 * Expected row shape: { name, email, external_id, ticket_type }
 * Missing/unmapped ticket_type rows are counted in the sync run but not imported.
 */

async function fetchRosterPage(connection, cursor) {
  // CSV connections deliver rows in the import request body, not via pagination.
  // This adapter returns an empty page — CSV imports go through the /attendees/import endpoint.
  return { tickets: [], nextCursor: null };
}

function getDeltaCursor() {
  return null;
}

module.exports = { fetchRosterPage, getDeltaCursor };
