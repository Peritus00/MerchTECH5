'use strict';
/**
 * Ticket sync router
 * Provider connections, type mapping, sync runs
 */

const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validator');
const { requireEventRole } = require('./middleware');
const { authenticateToken } = require('../auth');
const db = require('../config/database');

// ── PROVIDER CONNECTIONS ──────────────────────────────────────────────────────
router.get('/:eventId/connections',
  authenticateToken, requireEventRole('event_manager'),
  async (req, res, next) => {
    try {
      const r = await db.query(
        `SELECT id, event_id, provider, external_event_id, is_active, created_at
         FROM ticket_provider_connections WHERE event_id=$1 ORDER BY id`,
        [req.params.eventId], { queryName: 'list_connections', requestId: req.requestId }
      );
      res.json(r.rows);
    } catch (err) { next(err); }
  }
);

router.post('/:eventId/connections',
  authenticateToken, requireEventRole('event_manager'),
  [
    body('provider').isIn(['in_house','csv','eventbrite','tixr','dice','ticketmaster','see_tickets']),
    body('external_event_id').optional().isString(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { provider, external_event_id } = req.body;
      const r = await db.query(
        `INSERT INTO ticket_provider_connections (event_id,provider,external_event_id)
         VALUES ($1,$2,$3) RETURNING id,event_id,provider,external_event_id,is_active,created_at`,
        [req.params.eventId, provider, external_event_id || null],
        { queryName: 'create_connection', requestId: req.requestId }
      );
      res.status(201).json(r.rows[0]);
    } catch (err) { next(err); }
  }
);

// ── TYPE MAPPING ──────────────────────────────────────────────────────────────
router.get('/:eventId/connections/:connectionId/type-map',
  authenticateToken, requireEventRole('event_manager'),
  async (req, res, next) => {
    try {
      const r = await db.query(
        `SELECT m.*, al.name AS access_level_name FROM ticket_provider_type_map m
         JOIN access_levels al ON al.id = m.access_level_id
         WHERE m.connection_id=$1`,
        [req.params.connectionId], { queryName: 'list_type_map', requestId: req.requestId }
      );
      res.json(r.rows);
    } catch (err) { next(err); }
  }
);

router.put('/:eventId/connections/:connectionId/type-map',
  authenticateToken, requireEventRole('event_manager'),
  [
    body('external_ticket_type').trim().notEmpty(),
    body('access_level_id').isInt(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { external_ticket_type, access_level_id } = req.body;
      const r = await db.query(
        `INSERT INTO ticket_provider_type_map (connection_id, external_ticket_type, access_level_id)
         VALUES ($1,$2,$3)
         ON CONFLICT (connection_id, external_ticket_type)
         DO UPDATE SET access_level_id = EXCLUDED.access_level_id
         RETURNING *`,
        [req.params.connectionId, external_ticket_type, access_level_id],
        { queryName: 'upsert_type_map', requestId: req.requestId }
      );
      res.json(r.rows[0]);
    } catch (err) { next(err); }
  }
);

// ── SYNC RUN ──────────────────────────────────────────────────────────────────
router.post('/:eventId/connections/:connectionId/sync',
  authenticateToken, requireEventRole('event_manager'),
  async (req, res, next) => {
    try {
      const { connectionId, eventId } = req.params;

      // Validate connection belongs to event
      const connResult = await db.query(
        'SELECT * FROM ticket_provider_connections WHERE id=$1 AND event_id=$2',
        [connectionId, eventId],
        { queryName: 'get_connection', requestId: req.requestId }
      );
      if (!connResult.rows[0]) return res.status(404).json({ error: 'Connection not found' });

      // Create sync run record
      const runResult = await db.query(
        `INSERT INTO ticket_sync_runs (connection_id, status) VALUES ($1,'running') RETURNING *`,
        [connectionId], { queryName: 'create_sync_run', requestId: req.requestId }
      );
      const run = runResult.rows[0];

      // Run sync asynchronously — respond immediately with run ID
      setImmediate(async () => {
        try {
          const { getAdapter } = require('../lib/providers/types');
          const adapter = getAdapter(connResult.rows[0].provider);

          let cursor = null;
          let totalImported = 0;
          let totalSkipped = 0;
          let totalErrored = 0;

          do {
            const page = await adapter.fetchRosterPage(connResult.rows[0], cursor);

            for (const externalTicket of page.tickets) {
              // Map external ticket type to access level
              const mapResult = await db.query(
                `SELECT access_level_id FROM ticket_provider_type_map
                 WHERE connection_id=$1 AND external_ticket_type=$2`,
                [connectionId, externalTicket.ticket_type]
              );
              if (!mapResult.rows[0]) {
                totalSkipped++;
                continue;
              }

              const accessLevelId = mapResult.rows[0].access_level_id;

              try {
                // Upsert attendee
                const attendeeResult = await db.query(
                  `INSERT INTO attendees (event_id, name, email, source, external_id)
                   VALUES ($1,$2,$3,$4,$5)
                   ON CONFLICT DO NOTHING
                   RETURNING id`,
                  [eventId, externalTicket.name, externalTicket.email?.toLowerCase(),
                   connResult.rows[0].provider, externalTicket.external_id]
                );

                if (attendeeResult.rows[0]) {
                  // Find or create ticket type
                  let ticketTypeResult = await db.query(
                    'SELECT id FROM ticket_types WHERE event_id=$1 AND access_level_id=$2 AND name=$3',
                    [eventId, accessLevelId, externalTicket.ticket_type]
                  );
                  let ticketTypeId = ticketTypeResult.rows[0]?.id;

                  if (!ticketTypeId) {
                    const newType = await db.query(
                      `INSERT INTO ticket_types (event_id, access_level_id, name, price_cents)
                       VALUES ($1,$2,$3,0) RETURNING id`,
                      [eventId, accessLevelId, externalTicket.ticket_type]
                    );
                    ticketTypeId = newType.rows[0].id;
                  }

                  await db.query(
                    `INSERT INTO tickets (event_id, attendee_id, ticket_type_id)
                     VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
                    [eventId, attendeeResult.rows[0].id, ticketTypeId]
                  );
                  totalImported++;
                } else {
                  totalSkipped++;
                }
              } catch (rowErr) {
                totalErrored++;
              }
            }

            cursor = page.nextCursor;
          } while (cursor);

          await db.query(
            `UPDATE ticket_sync_runs SET status='completed', imported=$1, skipped=$2, errored=$3, completed_at=NOW()
             WHERE id=$4`,
            [totalImported, totalSkipped, totalErrored, run.id]
          );
        } catch (syncErr) {
          await db.query(
            `UPDATE ticket_sync_runs SET status='failed', error_text=$1, completed_at=NOW() WHERE id=$2`,
            [syncErr.message, run.id]
          );
        }
      });

      res.status(202).json({ run_id: run.id, status: 'running' });
    } catch (err) { next(err); }
  }
);

router.get('/:eventId/connections/:connectionId/sync-runs',
  authenticateToken, requireEventRole('event_manager'),
  async (req, res, next) => {
    try {
      const r = await db.query(
        `SELECT * FROM ticket_sync_runs WHERE connection_id=$1 ORDER BY started_at DESC LIMIT 20`,
        [req.params.connectionId], { queryName: 'list_sync_runs', requestId: req.requestId }
      );
      res.json(r.rows);
    } catch (err) { next(err); }
  }
);

module.exports = router;
