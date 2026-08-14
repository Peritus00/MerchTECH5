'use strict';
/**
 * Scanning router
 * Pre-flight, batch scan upload, manual override
 */

const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const { validate } = require('../middleware/validator');
const { requireEventRole, filterAttendeePII } = require('./middleware');
const { authenticateToken } = require('../auth');
const { evaluateGateDecision } = require('../lib/tokenEvaluation');
const db = require('../config/database');

// ── PRE-FLIGHT ROSTER DOWNLOAD ────────────────────────────────────────────────
// Returns the roster in chunks of 500, along with the per-event signing key.
// Includes server_time for NTP drift detection on the scanner device.
router.get('/:eventId/preflight',
  authenticateToken, requireEventRole('door_scanner'),
  [
    query('cursor').optional().isInt({ min: 0 }),
    query('since').optional().isISO8601(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const eventId = req.params.eventId;
      const limit = 500;
      const cursor = parseInt(req.query.cursor) || 0;
      const since = req.query.since;

      // Fetch event
      const eventResult = await db.query(
        'SELECT * FROM events WHERE id=$1 AND deleted_at IS NULL',
        [eventId], { queryName: 'preflight_event', requestId: req.requestId }
      );
      if (!eventResult.rows[0]) return res.status(404).json({ error: 'Event not found' });
      const event = eventResult.rows[0];

      // Fetch signing key
      const keyResult = await db.query(
        `SELECT key_id, public_key, algorithm FROM event_signing_keys
         WHERE event_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [eventId], { queryName: 'preflight_signing_key', requestId: req.requestId }
      );

      // Fetch zones
      const zonesResult = await db.query(
        'SELECT * FROM event_zones WHERE event_id=$1 ORDER BY id',
        [eventId], { queryName: 'preflight_zones', requestId: req.requestId }
      );

      // Fetch access level zone tokens
      const tokensResult = await db.query(
        `SELECT t.*, al.event_id FROM access_level_zone_tokens t
         JOIN access_levels al ON al.id = t.access_level_id
         WHERE al.event_id=$1`,
        [eventId], { queryName: 'preflight_tokens', requestId: req.requestId }
      );

      // Fetch ticket/attendee roster (paginated, delta-aware)
      let rosterQuery = `
        SELECT t.id as ticket_id, t.public_code, t.revoked_at, t.updated_at,
               a.id as attendee_id, a.photo_s3_key, a.photo_status,
               tt.access_level_id
        FROM tickets t
        LEFT JOIN attendees a ON a.id = t.attendee_id
        LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
        WHERE t.event_id = $1`;
      const rosterParams = [eventId];

      if (since) {
        rosterParams.push(since);
        rosterQuery += ` AND t.updated_at > $${rosterParams.length}`;
      }

      rosterParams.push(cursor);
      rosterQuery += ` AND t.id > $${rosterParams.length}`;

      rosterParams.push(limit + 1);
      rosterQuery += ` ORDER BY t.id LIMIT $${rosterParams.length}`;

      const rosterResult = await db.query(rosterQuery, rosterParams,
        { queryName: 'preflight_roster', requestId: req.requestId });

      const hasMore = rosterResult.rows.length > limit;
      const tickets = rosterResult.rows.slice(0, limit);
      const nextCursor = hasMore ? tickets[tickets.length - 1].ticket_id : null;

      // Strip PII for door_scanner
      const filteredTickets = tickets.map(t => filterAttendeePII({
        ...t,
        has_photo: !!t.photo_s3_key,
      }, req.eventRole));

      // Update scanner device pre-flight record
      await db.query(
        `INSERT INTO scanner_devices (event_id, device_name, last_preflight_at, clock_drift_ms)
         VALUES ($1, $2, NOW(), $3)
         ON CONFLICT DO NOTHING`,
        [eventId, req.headers['x-device-name'] || 'unknown', parseInt(req.headers['x-clock-drift-ms']) || null],
        { queryName: 'upsert_scanner_device', requestId: req.requestId }
      );

      res.json({
        event: {
          id: event.id,
          timezone: event.timezone,
          daily_reset_time: event.daily_reset_time,
          validation_mode: event.validation_mode,
          qr_visible_from: event.qr_visible_from,
        },
        signing_key: keyResult.rows[0] || null,
        access_zones: zonesResult.rows,
        access_level_zone_tokens: tokensResult.rows,
        tickets: filteredTickets,
        server_time: new Date().toISOString(), // for NTP drift check on client
        sync_timestamp: new Date().toISOString(),
        has_more: hasMore,
        next_cursor: nextCursor,
      });
    } catch (err) { next(err); }
  }
);

// ── BATCH SCAN UPLOAD ─────────────────────────────────────────────────────────
// Dedupes on client_scan_uuid (idempotent). Returns per-scan outcomes.
router.post('/:eventId/batch',
  authenticateToken, requireEventRole('door_scanner'),
  [
    body('scans').isArray({ min: 1 }),
    body('scans.*.client_scan_uuid').isUUID(),
    body('scans.*.public_code').isUUID(),
    body('scans.*.zone_id').isInt(),
    body('scans.*.direction').isIn(['entry','exit']),
    body('scans.*.validation_mode_used').isIn(['strict','trust','manual_override']),
    body('scans.*.scanned_at').isISO8601(),
    body('scans.*.was_offline').isBoolean(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const eventId = req.params.eventId;
      const { scans } = req.body;

      // Load event config for token evaluation
      const eventResult = await db.query(
        'SELECT timezone, daily_reset_time FROM events WHERE id=$1',
        [eventId], { queryName: 'batch_event', requestId: req.requestId }
      );
      const event = eventResult.rows[0];
      if (!event) return res.status(404).json({ error: 'Event not found' });

      const outcomes = [];
      const client = await db.getClient();
      try {
        await client.query('BEGIN');

        for (const scan of scans) {
          // Idempotency check
          const existing = await client.query(
            'SELECT id, result FROM scan_events WHERE client_scan_uuid=$1',
            [scan.client_scan_uuid]
          );
          if (existing.rows[0]) {
            outcomes.push({ client_scan_uuid: scan.client_scan_uuid, result: existing.rows[0].result, deduplicated: true });
            continue;
          }

          // Look up ticket
          const ticketResult = await client.query(
            'SELECT t.*, tt.access_level_id FROM tickets t LEFT JOIN ticket_types tt ON tt.id=t.ticket_type_id WHERE t.public_code=$1 AND t.event_id=$2',
            [scan.public_code, eventId]
          );
          const ticket = ticketResult.rows[0];

          if (!ticket) {
            // Ticket not in DB — store denied scan and continue
            await client.query(
              `INSERT INTO scan_events (client_scan_uuid,event_id,zone_id,direction,result,deny_reason,validation_mode_used,was_offline,scanned_at)
               VALUES ($1,$2,$3,$4,'denied','unknown_ticket',$5,$6,$7)`,
              [scan.client_scan_uuid, eventId, scan.zone_id, scan.direction,
               scan.validation_mode_used, scan.was_offline, scan.scanned_at]
            );
            outcomes.push({ client_scan_uuid: scan.client_scan_uuid, result: 'denied', deny_reason: 'unknown_ticket' });
            continue;
          }

          // Load zone token config
          const zoneTokenResult = await client.query(
            `SELECT * FROM access_level_zone_tokens
             WHERE access_level_id=$1 AND zone_id=$2`,
            [ticket.access_level_id, scan.zone_id]
          );
          const zoneToken = zoneTokenResult.rows[0] || null;

          // Load current zone state
          const stateResult = await client.query(
            'SELECT * FROM ticket_zone_state WHERE ticket_id=$1 AND zone_id=$2',
            [ticket.id, scan.zone_id]
          );
          const zoneState = stateResult.rows[0] || null;

          const decision = evaluateGateDecision({
            ticket,
            zoneToken,
            zoneState,
            direction: scan.direction,
            event,
            now: new Date(scan.scanned_at),
          });

          // Write scan event
          await client.query(
            `INSERT INTO scan_events
               (client_scan_uuid,ticket_id,event_id,zone_id,direction,result,deny_reason,
                validation_mode_used,was_offline,scanned_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [scan.client_scan_uuid, ticket.id, eventId, scan.zone_id, scan.direction,
             decision.granted ? 'granted' : 'denied', decision.denyReason,
             scan.validation_mode_used, scan.was_offline, scan.scanned_at]
          );

          // Update materialized state if granted
          if (decision.granted && decision.updatedState) {
            const s = decision.updatedState;
            await client.query(
              `INSERT INTO ticket_zone_state (ticket_id,zone_id,is_inside,entries_used,exits_used,last_reset_on,updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,NOW())
               ON CONFLICT (ticket_id,zone_id) DO UPDATE SET
                 is_inside=EXCLUDED.is_inside, entries_used=EXCLUDED.entries_used,
                 exits_used=EXCLUDED.exits_used, last_reset_on=EXCLUDED.last_reset_on,
                 updated_at=NOW()`,
              [ticket.id, scan.zone_id,
               scan.direction === 'entry',
               s.entries_used, s.exits_used, s.last_reset_on]
            );
          }

          outcomes.push({
            client_scan_uuid: scan.client_scan_uuid,
            ticket_id: ticket.id,
            result: decision.granted ? 'granted' : 'denied',
            deny_reason: decision.denyReason,
          });
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      res.json({ outcomes, server_time: new Date().toISOString() });
    } catch (err) { next(err); }
  }
);

// ── MANUAL OVERRIDE ───────────────────────────────────────────────────────────
router.post('/:eventId/override',
  authenticateToken, requireEventRole('event_manager'),
  [
    body('public_code').isUUID(),
    body('zone_id').isInt(),
    body('action').isIn(['force_entry','force_exit']),
    body('reason').trim().notEmpty(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { public_code, zone_id, action, reason } = req.body;
      const direction = action === 'force_entry' ? 'entry' : 'exit';

      const ticketResult = await db.query(
        'SELECT id FROM tickets WHERE public_code=$1 AND event_id=$2',
        [public_code, req.params.eventId],
        { queryName: 'override_ticket', requestId: req.requestId }
      );
      if (!ticketResult.rows[0]) return res.status(404).json({ error: 'Ticket not found' });

      const ticketId = ticketResult.rows[0].id;
      const clientUuid = require('crypto').randomUUID();

      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO scan_events
             (client_scan_uuid,ticket_id,event_id,zone_id,direction,result,deny_reason,
              validation_mode_used,was_offline,scanned_at)
           VALUES ($1,$2,$3,$4,$5,'granted',$6,'manual_override',FALSE,NOW())`,
          [clientUuid, ticketId, req.params.eventId, zone_id, direction, reason]
        );
        await client.query(
          `INSERT INTO ticket_zone_state (ticket_id,zone_id,is_inside,entries_used,exits_used,updated_at)
           VALUES ($1,$2,$3,0,0,NOW())
           ON CONFLICT (ticket_id,zone_id) DO UPDATE SET
             is_inside=$3, updated_at=NOW()`,
          [ticketId, zone_id, direction === 'entry']
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      res.json({ success: true });
    } catch (err) { next(err); }
  }
);

module.exports = router;
