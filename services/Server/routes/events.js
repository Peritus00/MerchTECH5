'use strict';
/**
 * Events router
 * CRUD for events, event_days, event_zones, access_levels, access_level_zone_tokens
 */

const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validator');
const { requireEventRole } = require('./middleware');
const db = require('../config/database');

// Pulled from main.js via module.exports (added below)
const { authenticateToken } = require('../auth');

// ── LIST EVENTS (own or staffed) ──────────────────────────────────────────────
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const result = await db.query(
      `SELECT e.* FROM events e
       WHERE e.deleted_at IS NULL
         AND (e.created_by_user_id = $1
              OR EXISTS (
                SELECT 1 FROM event_staff s
                WHERE s.event_id = e.id AND s.user_id = $1 AND s.revoked_at IS NULL
              )
              OR EXISTS (SELECT 1 FROM users u WHERE u.id = $1 AND u.is_admin))
       ORDER BY e.starts_at DESC`,
      [userId],
      { queryName: 'list_events', requestId: req.requestId }
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// ── CREATE EVENT ──────────────────────────────────────────────────────────────
router.post('/',
  authenticateToken,
  [
    body('name').trim().notEmpty().withMessage('name is required'),
    body('timezone').trim().notEmpty().withMessage('timezone is required'),
    body('starts_at').isISO8601().withMessage('starts_at must be ISO 8601'),
    body('ends_at').isISO8601().withMessage('ends_at must be ISO 8601'),
    body('validation_mode').optional().isIn(['strict','trust']),
    body('daily_reset_time').optional().matches(/^\d{2}:\d{2}:\d{2}$/),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, timezone, starts_at, ends_at, event_year, capacity,
              validation_mode = 'strict', qr_visible_from, daily_reset_time = '04:00:00',
              photo_retention_days } = req.body;

      if (new Date(starts_at) >= new Date(ends_at)) {
        return res.status(400).json({ error: 'starts_at must be before ends_at', code: 'INVALID_DATES' });
      }

      const result = await db.query(
        `INSERT INTO events
           (created_by_user_id, name, timezone, starts_at, ends_at, event_year, capacity,
            validation_mode, qr_visible_from, daily_reset_time, photo_retention_days, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft')
         RETURNING *`,
        [req.user.userId, name, timezone, starts_at, ends_at, event_year, capacity,
         validation_mode, qr_visible_from, daily_reset_time, photo_retention_days],
        { queryName: 'create_event', requestId: req.requestId }
      );
      res.status(201).json(result.rows[0]);
    } catch (err) { next(err); }
  }
);

// ── GET EVENT ─────────────────────────────────────────────────────────────────
router.get('/:eventId',
  authenticateToken,
  requireEventRole('door_scanner'),
  async (req, res, next) => {
    try {
      const result = await db.query(
        'SELECT * FROM events WHERE id = $1 AND deleted_at IS NULL',
        [req.params.eventId],
        { queryName: 'get_event', requestId: req.requestId }
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'Event not found' });
      res.json(result.rows[0]);
    } catch (err) { next(err); }
  }
);

// ── UPDATE EVENT ──────────────────────────────────────────────────────────────
router.patch('/:eventId',
  authenticateToken,
  requireEventRole('event_manager'),
  [
    body('name').optional().trim().notEmpty(),
    body('timezone').optional().trim().notEmpty(),
    body('starts_at').optional().isISO8601(),
    body('ends_at').optional().isISO8601(),
    body('validation_mode').optional().isIn(['strict','trust']),
    body('daily_reset_time').optional().matches(/^\d{2}:\d{2}:\d{2}$/),
    body('status').optional().isIn(['draft','published','archived']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const allowed = ['name','timezone','starts_at','ends_at','event_year','capacity',
                       'validation_mode','qr_visible_from','daily_reset_time',
                       'photo_retention_days','status'];
      const updates = Object.fromEntries(
        Object.entries(req.body).filter(([k]) => allowed.includes(k))
      );
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }
      const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
      const values = [req.params.eventId, ...Object.values(updates)];
      const result = await db.query(
        `UPDATE events SET ${setClauses}, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
        values,
        { queryName: 'update_event', requestId: req.requestId }
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'Event not found' });
      res.json(result.rows[0]);
    } catch (err) { next(err); }
  }
);

// ── DELETE EVENT (soft) ───────────────────────────────────────────────────────
router.delete('/:eventId',
  authenticateToken,
  requireEventRole('super_admin'),
  async (req, res, next) => {
    try {
      const result = await db.query(
        `UPDATE events SET deleted_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
        [req.params.eventId],
        { queryName: 'delete_event', requestId: req.requestId }
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'Event not found' });
      res.json({ deleted: true });
    } catch (err) { next(err); }
  }
);

// ── ZONES ─────────────────────────────────────────────────────────────────────
router.get('/:eventId/zones',
  authenticateToken, requireEventRole('door_scanner'),
  async (req, res, next) => {
    try {
      const r = await db.query('SELECT * FROM event_zones WHERE event_id=$1 ORDER BY id',
        [req.params.eventId], { queryName: 'list_zones', requestId: req.requestId });
      res.json(r.rows);
    } catch (err) { next(err); }
  }
);

router.post('/:eventId/zones',
  authenticateToken, requireEventRole('event_manager'),
  [
    body('name').trim().notEmpty(),
    body('zone_type').isIn(['outer_space','interior']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, zone_type, parent_zone_id, capacity } = req.body;
      const r = await db.query(
        `INSERT INTO event_zones (event_id,name,zone_type,parent_zone_id,capacity)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [req.params.eventId, name, zone_type, parent_zone_id || null, capacity || null],
        { queryName: 'create_zone', requestId: req.requestId }
      );
      res.status(201).json(r.rows[0]);
    } catch (err) { next(err); }
  }
);

router.patch('/:eventId/zones/:zoneId',
  authenticateToken, requireEventRole('event_manager'),
  async (req, res, next) => {
    try {
      const { name, zone_type, parent_zone_id, capacity } = req.body;
      const r = await db.query(
        `UPDATE event_zones SET name=COALESCE($1,name), zone_type=COALESCE($2,zone_type),
          parent_zone_id=COALESCE($3,parent_zone_id), capacity=COALESCE($4,capacity)
         WHERE id=$5 AND event_id=$6 RETURNING *`,
        [name, zone_type, parent_zone_id, capacity, req.params.zoneId, req.params.eventId],
        { queryName: 'update_zone', requestId: req.requestId }
      );
      if (!r.rows[0]) return res.status(404).json({ error: 'Zone not found' });
      res.json(r.rows[0]);
    } catch (err) { next(err); }
  }
);

router.delete('/:eventId/zones/:zoneId',
  authenticateToken, requireEventRole('event_manager'),
  async (req, res, next) => {
    try {
      const r = await db.query(
        'DELETE FROM event_zones WHERE id=$1 AND event_id=$2 RETURNING id',
        [req.params.zoneId, req.params.eventId],
        { queryName: 'delete_zone', requestId: req.requestId }
      );
      if (!r.rows[0]) return res.status(404).json({ error: 'Zone not found' });
      res.json({ deleted: true });
    } catch (err) { next(err); }
  }
);

// ── ACCESS LEVELS ─────────────────────────────────────────────────────────────
router.get('/:eventId/access-levels',
  authenticateToken, requireEventRole('door_scanner'),
  async (req, res, next) => {
    try {
      const r = await db.query(
        `SELECT al.*, json_agg(t.*) FILTER (WHERE t.id IS NOT NULL) AS zone_tokens
         FROM access_levels al
         LEFT JOIN access_level_zone_tokens t ON t.access_level_id = al.id
         WHERE al.event_id = $1
         GROUP BY al.id ORDER BY al.id`,
        [req.params.eventId], { queryName: 'list_access_levels', requestId: req.requestId }
      );
      res.json(r.rows);
    } catch (err) { next(err); }
  }
);

router.post('/:eventId/access-levels',
  authenticateToken, requireEventRole('event_manager'),
  [
    body('name').trim().notEmpty(),
    body('requires_credential').optional().isBoolean(),
    body('counts_toward_capacity').optional().isBoolean(),
    body('is_infinite_access').optional().isBoolean(),
    body('drink_tokens_default').optional().isInt({ min: 0 }),
    body('food_tokens_default').optional().isInt({ min: 0 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, color, requires_credential = false, counts_toward_capacity = true,
              is_infinite_access = false, drink_tokens_default = 0, food_tokens_default = 0 } = req.body;
      const r = await db.query(
        `INSERT INTO access_levels
           (event_id,name,color,requires_credential,counts_toward_capacity,
            is_infinite_access,drink_tokens_default,food_tokens_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.params.eventId, name, color, requires_credential, counts_toward_capacity,
         is_infinite_access, drink_tokens_default, food_tokens_default],
        { queryName: 'create_access_level', requestId: req.requestId }
      );
      res.status(201).json(r.rows[0]);
    } catch (err) { next(err); }
  }
);

router.patch('/:eventId/access-levels/:levelId',
  authenticateToken, requireEventRole('event_manager'),
  async (req, res, next) => {
    try {
      const allowed = ['name','color','requires_credential','counts_toward_capacity',
                       'is_infinite_access','drink_tokens_default','food_tokens_default',
                       'credential_template_id'];
      const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
      if (!Object.keys(updates).length) return res.status(400).json({ error: 'No valid fields' });
      const setClauses = Object.keys(updates).map((k, i) => `${k}=$${i+2}`).join(', ');
      const r = await db.query(
        `UPDATE access_levels SET ${setClauses} WHERE id=$1 AND event_id=$${Object.keys(updates).length+2} RETURNING *`,
        [req.params.levelId, ...Object.values(updates), req.params.eventId],
        { queryName: 'update_access_level', requestId: req.requestId }
      );
      if (!r.rows[0]) return res.status(404).json({ error: 'Access level not found' });
      res.json(r.rows[0]);
    } catch (err) { next(err); }
  }
);

// ── ZONE TOKEN MATRIX (per access level) ─────────────────────────────────────
router.put('/:eventId/access-levels/:levelId/zone-tokens',
  authenticateToken, requireEventRole('event_manager'),
  [
    body('zone_id').isInt(),
    body('entry_limit').optional({ nullable: true }).isInt({ min: 0 }),
    body('exit_limit').optional({ nullable: true }).isInt({ min: 0 }),
    body('reset_policy').optional().isIn(['daily','camping','none']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { zone_id, entry_limit, exit_limit, window_start_time, window_end_time, reset_policy = 'none' } = req.body;
      const r = await db.query(
        `INSERT INTO access_level_zone_tokens
           (access_level_id, zone_id, entry_limit, exit_limit, window_start_time, window_end_time, reset_policy)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (access_level_id, zone_id) DO UPDATE SET
           entry_limit=EXCLUDED.entry_limit, exit_limit=EXCLUDED.exit_limit,
           window_start_time=EXCLUDED.window_start_time, window_end_time=EXCLUDED.window_end_time,
           reset_policy=EXCLUDED.reset_policy
         RETURNING *`,
        [req.params.levelId, zone_id, entry_limit ?? null, exit_limit ?? null,
         window_start_time || null, window_end_time || null, reset_policy],
        { queryName: 'upsert_zone_token', requestId: req.requestId }
      );
      res.json(r.rows[0]);
    } catch (err) { next(err); }
  }
);

// ── SIGNING KEY GENERATION ────────────────────────────────────────────────────
// Generates a new ECDSA P-256 key pair for the event.
// Returns the private key ONCE for the caller to store in the environment.
router.post('/:eventId/signing-key',
  authenticateToken, requireEventRole('super_admin'),
  async (req, res, next) => {
    try {
      const { generateEventSigningKey } = require('../signingKeyService');
      const result = await generateEventSigningKey(req.params.eventId);
      // Private key returned only here — store as env var EVENT_SIGNING_KEY_<KEY_ID_UPPERCASE>
      res.status(201).json({
        key_id: result.keyId,
        public_key: result.publicKey,
        private_key_pem: result.privateKeyPEM,
        warning: 'Store private_key_pem in your environment as EVENT_SIGNING_KEY_' +
                 result.keyId.toUpperCase().replace(/-/g, '_') +
                 ' and delete this response. It will not be shown again.',
      });
    } catch (err) { next(err); }
  }
);

// ── EVENT STAFF ───────────────────────────────────────────────────────────────
router.get('/:eventId/staff',
  authenticateToken, requireEventRole('event_manager'),
  async (req, res, next) => {
    try {
      const r = await db.query(
        `SELECT s.*, u.email, u.username FROM event_staff s
         JOIN users u ON u.id = s.user_id
         WHERE s.event_id=$1 AND s.revoked_at IS NULL ORDER BY s.granted_at`,
        [req.params.eventId], { queryName: 'list_staff', requestId: req.requestId }
      );
      res.json(r.rows);
    } catch (err) { next(err); }
  }
);

router.post('/:eventId/staff',
  authenticateToken, requireEventRole('event_manager'),
  [
    body('user_id').isInt(),
    body('role').isIn(['super_admin','event_manager','door_scanner','credential_desk','seller']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { user_id, role } = req.body;
      const { canManageRole } = require('../lib/tokenEvaluation');
      if (!canManageRole(req.eventRole, role)) {
        return res.status(403).json({ error: `Your role cannot grant ${role}`, code: 'ROLE_ESCALATION' });
      }
      // Revoke any existing active role first
      await db.query(
        `UPDATE event_staff SET revoked_at=NOW() WHERE event_id=$1 AND user_id=$2 AND revoked_at IS NULL`,
        [req.params.eventId, user_id],
        { queryName: 'revoke_existing_staff', requestId: req.requestId }
      );
      const r = await db.query(
        `INSERT INTO event_staff (event_id,user_id,role,granted_by) VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.params.eventId, user_id, role, req.user.userId],
        { queryName: 'grant_staff', requestId: req.requestId }
      );
      res.status(201).json(r.rows[0]);
    } catch (err) { next(err); }
  }
);

router.delete('/:eventId/staff/:staffId',
  authenticateToken, requireEventRole('event_manager'),
  async (req, res, next) => {
    try {
      // Check the target staff member's role before revoking
      const staffRow = await db.query(
        'SELECT role FROM event_staff WHERE id=$1 AND event_id=$2 AND revoked_at IS NULL',
        [req.params.staffId, req.params.eventId],
        { queryName: 'get_staff_row', requestId: req.requestId }
      );
      if (!staffRow.rows[0]) return res.status(404).json({ error: 'Staff member not found' });
      const { canManageRole } = require('../lib/tokenEvaluation');
      if (!canManageRole(req.eventRole, staffRow.rows[0].role)) {
        return res.status(403).json({ error: `Your role cannot revoke ${staffRow.rows[0].role}`, code: 'ROLE_ESCALATION' });
      }
      await db.query(
        'UPDATE event_staff SET revoked_at=NOW() WHERE id=$1',
        [req.params.staffId],
        { queryName: 'revoke_staff', requestId: req.requestId }
      );
      res.json({ revoked: true });
    } catch (err) { next(err); }
  }
);

module.exports = router;
