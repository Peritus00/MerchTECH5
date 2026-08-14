'use strict';
/**
 * Eventbrite provider adapter
 * Fetches attendees from the Eventbrite REST API using the connection's credentials.
 *
 * Requires connection.credentials_encrypted to be decrypted to a JSON object:
 *   { api_token: string }
 */

const https = require('https');

const EB_BASE = 'https://www.eventbriteapi.com/v3';

function get(url, token) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { Authorization: `Bearer ${token}` },
    }, (res) => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
  });
}

async function fetchRosterPage(connection, cursor) {
  // credentials_encrypted should be decrypted before calling this adapter.
  // For now we assume connection.api_token is available (decryption handled by caller).
  const token = connection.api_token;
  if (!token) throw new Error('Eventbrite api_token not configured on connection');

  const eventId = connection.external_event_id;
  let url = `${EB_BASE}/events/${eventId}/attendees/?status=attending&page_size=500`;
  if (cursor) url += `&continuation=${cursor}`;

  const response = await get(url, token);

  if (response.error) throw new Error(`Eventbrite API error: ${response.error_description || response.error}`);

  const tickets = (response.attendees || []).map(a => ({
    name: `${a.profile?.first_name || ''} ${a.profile?.last_name || ''}`.trim(),
    email: a.profile?.email?.toLowerCase() || null,
    external_id: a.id,
    ticket_type: a.ticket_class_name || 'General Admission',
  }));

  const nextCursor = response.pagination?.has_more_items
    ? response.pagination.continuation
    : null;

  return { tickets, nextCursor };
}

function getDeltaCursor(lastRun) {
  return lastRun?.cursor || null;
}

module.exports = { fetchRosterPage, getDeltaCursor };
