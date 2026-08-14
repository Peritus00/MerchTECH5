'use strict';
/**
 * Provider adapter interface
 *
 * Each adapter must implement:
 *   fetchRosterPage(connection, cursor) → { tickets: [...], nextCursor: string|null }
 *   getDeltaCursor(lastRun) → string|null
 *
 * tickets array items:
 *   { name, email, external_id, ticket_type }
 */

const inHouse = require('./inHouse');
const csv = require('./csv');
const eventbrite = require('./eventbrite');

const ADAPTERS = {
  in_house: inHouse,
  csv,
  eventbrite,
  tixr: unavailable('Tixr'),
  dice: unavailable('DICE'),
  ticketmaster: unavailable('Ticketmaster'),
  see_tickets: unavailable('See Tickets'),
};

function unavailable(name) {
  return {
    async fetchRosterPage() {
      throw new Error(`${name} requires a partner agreement. Integration not yet available.`);
    },
    getDeltaCursor() { return null; },
  };
}

function getAdapter(provider) {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new Error(`Unknown provider: ${provider}`);
  return adapter;
}

module.exports = { getAdapter };
