'use strict';
/**
 * Tickets router
 * Ticket types, tickets, attendees, CSV import, photo upload links, entitlement redemption
 */

const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validator');
const { requireEventRole, filterAttendeePII } = require('./middleware');
const { authenticateToken } = require('../auth');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// ── PUBLIC TICKET LOOKUP (no auth; used by digital ticket screen) ─────────────
router.get('/public/:publicCode', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT t.public_code, t.drink_tokens_remaining, t.food_tokens_remaining, t.revoked_at,
              a.name AS attendee_name,
              al.name AS access_level_name,
              al.color AS access_level_color,
              e.name AS event_name,
              e.starts_at AS event_starts_at,
              e.ends_at AS event_ends_at,
              e.qr_visible_from
       FROM tickets t
       LEFT JOIN attendees a ON a.id = t.attendee_id
       LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
       LEFT JOIN access_levels al ON al.id = tt.access_level_id
       JOIN events e ON e.id = t.event_id
       WHERE t.public_code = $1 AND t.revoked_at IS NULL`,
      [req.params.publicCode],
      { queryName: 'public_ticket_lookup', requestId: req.requestId }
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Ticket not found' });

    const ticket = result.rows[0];
    const qrLocked = ticket.qr_visible_from
      ? new Date(ticket.qr_visible_from) > new Date()
      : false;

    res.json({ ...ticket, qr_locked: qrLocked });
  } catch (err) { next(err); }
});

// ── TICKET TYPES ──────────────────────────────────────────────────────────────
router.get('/:eventId/ticket-types',
  authenticateToken, requireEventRole('door_scanner'),
  async (req, res, next) => {
    try {
      const r = await db.query(
        'SELECT * FROM ticket_types WHERE event_id=$1 AND is_active=TRUE ORDER BY id',
        [req.params.eventId], { queryName: 'list_ticket_types', requestId: req.requestId }
      );
      res.json(r.rows);
    } catch (err) { next(err); }
  }
);

router.post('/:eventId/ticket-types',
  authenticateToken, requireEventRole('event_manager'),
  [
    body('name').trim().notEmpty(),
    body('access_level_id').isInt(),
    body('price_cents').isInt({ min: 0 }),
    body('quantity_total').optional({ nullable: true }).isInt({ min: 1 }),
    body('sales_start').optional({ nullable: true }).isISO8601(),
    body('sales_end').optional({ nullable: true }).isISO8601(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, access_level_id, price_cents, quantity_total, sales_start, sales_end, product_id } = req.body;
      const r = await db.query(
        `INSERT INTO ticket_types
           (event_id,access_level_id,name,price_cents,quantity_total,sales_start,sales_end,product_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.params.eventId, access_level_id, name, price_cents, quantity_total || null,
         sales_start || null, sales_end || null, product_id || null],
        { queryName: 'create_ticket_type', requestId: req.requestId }
      );
      res.status(201).json(r.rows[0]);
    } catch (err) { next(err); }
  }
);

// ── ATTENDEES ─────────────────────────────────────────────────────────────────
router.get('/:eventId/attendees',
  authenticateToken, requireEventRole('door_scanner'),
  [query('search').optional().trim(), query('page').optional().isInt({ min: 1 }), query('limit').optional().isInt({ min: 1, max: 500 })],
  validate,
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;
      const search = req.query.search;

      let whereClause = 'WHERE a.event_id=$1';
      const params = [req.params.eventId];
      if (search) {
        params.push(`%${search}%`);
        whereClause += ` AND (a.name ILIKE $${params.length} OR a.email ILIKE $${params.length})`;
      }

      const r = await db.query(
        `SELECT a.*, t.public_code, t.id as ticket_id, t.ticket_type_id,
                tt.access_level_id
         FROM attendees a
         LEFT JOIN tickets t ON t.attendee_id = a.id AND t.revoked_at IS NULL
         LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
         ${whereClause}
         ORDER BY a.id LIMIT $${params.length+1} OFFSET $${params.length+2}`,
        [...params, limit, offset],
        { queryName: 'list_attendees', requestId: req.requestId }
      );

      const rows = r.rows.map(a => filterAttendeePII(a, req.eventRole));
      res.json({ attendees: rows, page, limit });
    } catch (err) { next(err); }
  }
);

// ── CSV IMPORT ────────────────────────────────────────────────────────────────
router.post('/:eventId/attendees/import',
  authenticateToken, requireEventRole('event_manager'),
  async (req, res, next) => {
    try {
      const rows = req.body.rows; // pre-parsed by caller; use papaparse on client
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'No rows provided' });
      }

      let imported = 0;
      let skipped_duplicates = 0;
      let unmapped_ticket_types = 0;
      const errors = [];

      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!row.email) {
            errors.push({ row: i + 1, reason: 'missing email' });
            continue;
          }

          // Check for unmapped ticket type
          let accessLevelId = null;
          if (row.ticket_type && row.connection_id) {
            const mapResult = await client.query(
              `SELECT access_level_id FROM ticket_provider_type_map
               WHERE connection_id=$1 AND external_ticket_type=$2`,
              [row.connection_id, row.ticket_type]
            );
            if (mapResult.rows[0]) {
              accessLevelId = mapResult.rows[0].access_level_id;
            } else {
              unmapped_ticket_types++;
            }
          }

          // Upsert attendee
          const existing = await client.query(
            'SELECT id FROM attendees WHERE event_id=$1 AND email=$2',
            [req.params.eventId, row.email.toLowerCase().trim()]
          );

          if (existing.rows[0]) {
            skipped_duplicates++;
            continue;
          }

          await client.query(
            `INSERT INTO attendees (event_id, name, email, source, external_id)
             VALUES ($1,$2,$3,'csv',$4)`,
            [req.params.eventId, row.name || null, row.email.toLowerCase().trim(), row.external_id || null]
          );
          imported++;
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      res.json({ imported, skipped_duplicates, unmapped_ticket_types, errors });
    } catch (err) { next(err); }
  }
);

// ── PHOTO UPLOAD LINKS (single-use tokens for attendee self-upload) ────────────
router.post('/:eventId/photo-upload-links',
  authenticateToken, requireEventRole('event_manager'),
  [body('attendee_id').isInt()],
  validate,
  async (req, res, next) => {
    try {
      const token = uuidv4();
      // Store token with 24h expiry in a simple meta field on the attendee (or a dedicated table)
      // For now: encode as a signed JWT
      const jwt = require('jsonwebtoken');
      const uploadToken = jwt.sign(
        { attendee_id: req.body.attendee_id, event_id: req.params.eventId, purpose: 'photo_upload' },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      const uploadUrl = `${process.env.EXPO_PUBLIC_APP_URL || ''}/photo-upload/${uploadToken}`;
      res.json({ token: uploadToken, url: uploadUrl });
    } catch (err) { next(err); }
  }
);

// ── DELETE ATTENDEE PHOTO (manual retention enforcement) ──────────────────────
router.delete('/:eventId/attendees/:attendeeId/photo',
  authenticateToken, requireEventRole('event_manager'),
  async (req, res, next) => {
    try {
      const attendee = await db.query(
        'SELECT photo_s3_key FROM attendees WHERE id=$1 AND event_id=$2',
        [req.params.attendeeId, req.params.eventId],
        { queryName: 'get_attendee_photo', requestId: req.requestId }
      );
      if (!attendee.rows[0]) return res.status(404).json({ error: 'Attendee not found' });
      const s3Key = attendee.rows[0].photo_s3_key;
      if (!s3Key) return res.status(400).json({ error: 'No photo on file' });

      // Delete from S3
      const { deleteFile } = require('../s3Service');
      await deleteFile(s3Key);

      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        await client.query(
          'UPDATE attendees SET photo_s3_key=NULL, photo_status=\'none\', updated_at=NOW() WHERE id=$1',
          [req.params.attendeeId]
        );
        await client.query(
          `INSERT INTO photo_deletion_audit (event_id, attendee_id, s3_key, deleted_by)
           VALUES ($1,$2,$3,$4)`,
          [req.params.eventId, req.params.attendeeId, s3Key, req.user.userId]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      res.json({ deleted: true });
    } catch (err) { next(err); }
  }
);

// ── ENTITLEMENT REDEMPTION (POS) ───────────────────────────────────────────────
router.post('/:eventId/pos/redeem',
  authenticateToken, requireEventRole('seller'),
  [
    body('public_code').isUUID(),
    body('entitlement_type').isIn(['drink','food']),
    body('quantity').isInt({ min: 1 }),
    body('idempotency_key').isUUID().withMessage('idempotency_key must be a UUID'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { public_code, entitlement_type, quantity, idempotency_key } = req.body;
      const column = entitlement_type === 'drink' ? 'drink_tokens_remaining' : 'food_tokens_remaining';

      const client = await db.getClient();
      try {
        await client.query('BEGIN');

        // Idempotency: check if this key was already processed by looking for a scan record
        const idem = await client.query(
          `SELECT id FROM scan_events WHERE client_scan_uuid=$1`,
          [idempotency_key]
        );
        if (idem.rows[0]) {
          await client.query('ROLLBACK');
          // Re-fetch current state
          const t = await db.query('SELECT * FROM tickets WHERE public_code=$1', [public_code]);
          return res.json({ already_processed: true, remaining: t.rows[0]?.[column] ?? 0 });
        }

        // Atomic decrement with floor at zero
        const result = await client.query(
          `UPDATE tickets SET ${column} = GREATEST(${column} - $1, 0)
           WHERE public_code=$2 AND event_id=$3 AND revoked_at IS NULL
             AND ${column} >= $1
           RETURNING id, ${column} AS remaining`,
          [quantity, public_code, req.params.eventId]
        );

        if (!result.rows[0]) {
          await client.query('ROLLBACK');
          const current = await db.query('SELECT '+ column +' FROM tickets WHERE public_code=$1', [public_code]);
          return res.status(409).json({
            error: 'Insufficient tokens',
            remaining: current.rows[0]?.[column] ?? 0
          });
        }

        // Log as a scan event for audit trail
        await client.query(
          `INSERT INTO scan_events
             (client_scan_uuid, ticket_id, event_id, direction, result, validation_mode_used, scanned_at)
           VALUES ($1,$2,$3,'entry','granted','strict',NOW())`,
          [idempotency_key, result.rows[0].id, req.params.eventId]
        );

        await client.query('COMMIT');
        res.json({ success: true, remaining: result.rows[0].remaining });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) { next(err); }
  }
);

// ── STRIPE CHECKOUT (soft-reserve) ────────────────────────────────────────────
router.post('/:eventId/ticket-types/:typeId/checkout',
  authenticateToken,
  [
    body('quantity').isInt({ min: 1, max: 20 }),
    body('attendee_email').isEmail().normalizeEmail(),
    body('success_url').optional().isURL(),
    body('cancel_url').optional().isURL(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { quantity = 1, attendee_email, success_url, cancel_url } = req.body;
      const { eventId, typeId } = req.params;
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

      // Atomic soft-reserve — conditional increment; returns nothing if sold out.
      // No SELECT FOR UPDATE needed; a single UPDATE with a WHERE guard is atomic.
      const reserve = await db.query(
        `UPDATE ticket_types
         SET quantity_reserved = quantity_reserved + $1
         WHERE id = $2
           AND event_id = $3
           AND is_active = TRUE
           AND (quantity_total IS NULL OR quantity_sold + quantity_reserved + $1 <= quantity_total)
         RETURNING id, name, price_cents, quantity_total, quantity_sold, quantity_reserved`,
        [quantity, typeId, eventId],
        { queryName: 'soft_reserve', requestId: req.requestId }
      );

      if (!reserve.rows[0]) {
        return res.status(409).json({ error: 'Sold out or ticket type not available', code: 'SOLD_OUT' });
      }

      const ticketType = reserve.rows[0];

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: ticketType.name },
            unit_amount: ticketType.price_cents,
          },
          quantity,
        }],
        mode: 'payment',
        success_url: success_url || `${process.env.FRONTEND_URL}/tickets/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancel_url || `${process.env.FRONTEND_URL}/tickets/cancel`,
        customer_email: attendee_email,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30-minute session
        metadata: {
          type: 'event_ticket',
          event_id: String(eventId),
          ticket_type_id: String(typeId),
          quantity: String(quantity),
          attendee_email,
        },
      });

      // Record order as pending for idempotency on webhook
      await db.query(
        `INSERT INTO event_ticket_orders
           (event_id, ticket_type_id, stripe_session_id, quantity, amount_cents, attendee_email, status)
         VALUES ($1,$2,$3,$4,$5,$6,'pending')
         ON CONFLICT (stripe_session_id) DO NOTHING`,
        [eventId, typeId, session.id, quantity, ticketType.price_cents * quantity, attendee_email],
        { queryName: 'create_ticket_order', requestId: req.requestId }
      );

      res.json({ sessionId: session.id, url: session.url, success: true });
    } catch (err) { next(err); }
  }
);

module.exports = router;
