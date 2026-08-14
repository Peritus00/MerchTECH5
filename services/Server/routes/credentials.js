'use strict';
/**
 * Credentials router
 * Credential templates, credential print/void/reprint
 */

const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validator');
const { requireEventRole } = require('./middleware');
const { authenticateToken } = require('../auth');
const db = require('../config/database');

// ── CREDENTIAL TEMPLATES ──────────────────────────────────────────────────────
router.get('/:eventId/templates',
  authenticateToken, requireEventRole('credential_desk'),
  async (req, res, next) => {
    try {
      const r = await db.query(
        'SELECT * FROM credential_templates WHERE event_id=$1 ORDER BY id',
        [req.params.eventId], { queryName: 'list_templates', requestId: req.requestId }
      );
      res.json(r.rows);
    } catch (err) { next(err); }
  }
);

router.post('/:eventId/templates',
  authenticateToken, requireEventRole('event_manager'),
  [
    body('name').trim().notEmpty(),
    body('stock').isIn(['laminate_3x4','cr80']),
    body('width_mm').isFloat({ min: 1 }),
    body('height_mm').isFloat({ min: 1 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, stock, width_mm, height_mm, orientation = 'portrait', bleed_mm = 3,
              has_back = false, front_layout, back_layout, artwork_s3_key,
              show_photo = true, show_zone_strip = true, access_level_id } = req.body;
      const r = await db.query(
        `INSERT INTO credential_templates
           (event_id,access_level_id,name,stock,width_mm,height_mm,orientation,bleed_mm,
            has_back,front_layout,back_layout,artwork_s3_key,show_photo,show_zone_strip)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [req.params.eventId, access_level_id || null, name, stock, width_mm, height_mm,
         orientation, bleed_mm, has_back, front_layout ? JSON.stringify(front_layout) : null,
         back_layout ? JSON.stringify(back_layout) : null, artwork_s3_key || null,
         show_photo, show_zone_strip],
        { queryName: 'create_template', requestId: req.requestId }
      );
      res.status(201).json(r.rows[0]);
    } catch (err) { next(err); }
  }
);

// ── CREDENTIALS ───────────────────────────────────────────────────────────────
router.get('/:eventId/credentials',
  authenticateToken, requireEventRole('credential_desk'),
  async (req, res, next) => {
    try {
      const r = await db.query(
        `SELECT c.*, t.public_code, a.name AS attendee_name, a.email AS attendee_email,
                a.photo_s3_key, a.photo_status
         FROM credentials c
         JOIN tickets t ON t.id = c.ticket_id
         LEFT JOIN attendees a ON a.id = t.attendee_id
         WHERE c.event_id=$1
         ORDER BY c.credential_number`,
        [req.params.eventId], { queryName: 'list_credentials', requestId: req.requestId }
      );
      res.json(r.rows);
    } catch (err) { next(err); }
  }
);

// ── PRINT (create credential record) ─────────────────────────────────────────
router.post('/:eventId/credentials/print',
  authenticateToken, requireEventRole('credential_desk'),
  [
    body('ticket_id').isInt(),
    body('stock').isIn(['laminate_3x4','cr80']),
    body('template_id').optional().isInt(),
    body('signed_payload').optional().isString(),
    body('signing_key_id').optional().isString(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { ticket_id, stock, template_id, signed_payload, signing_key_id } = req.body;

      const client = await db.getClient();
      try {
        await client.query('BEGIN');

        // Generate sequential credential_number per event
        const numResult = await client.query(
          `SELECT COALESCE(MAX(credential_number),0)+1 AS next_num FROM credentials WHERE event_id=$1 FOR UPDATE`,
          [req.params.eventId]
        );
        const credNum = numResult.rows[0].next_num;

        // Supersede any existing active credential for this ticket
        await client.query(
          `UPDATE credentials SET status='superseded'
           WHERE ticket_id=$1 AND status='active'`,
          [ticket_id]
        );

        const r = await client.query(
          `INSERT INTO credentials
             (ticket_id,event_id,credential_number,stock,template_id,signed_payload,
              signing_key_id,printed_at,printed_by,status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8,'active') RETURNING *`,
          [ticket_id, req.params.eventId, credNum, stock, template_id || null,
           signed_payload || null, signing_key_id || null, req.user.userId]
        );

        await client.query('COMMIT');
        res.status(201).json(r.rows[0]);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) { next(err); }
  }
);

// ── VOID ──────────────────────────────────────────────────────────────────────
router.post('/:eventId/credentials/:credentialId/void',
  authenticateToken, requireEventRole('credential_desk'),
  [body('void_reason').optional().isString()],
  validate,
  async (req, res, next) => {
    try {
      const r = await db.query(
        `UPDATE credentials SET status='voided', void_reason=$1
         WHERE id=$2 AND event_id=$3 AND status='active' RETURNING *`,
        [req.body.void_reason || null, req.params.credentialId, req.params.eventId],
        { queryName: 'void_credential', requestId: req.requestId }
      );
      if (!r.rows[0]) return res.status(404).json({ error: 'Credential not found or not active' });
      res.json(r.rows[0]);
    } catch (err) { next(err); }
  }
);

// ── REPRINT ───────────────────────────────────────────────────────────────────
router.post('/:eventId/credentials/:credentialId/reprint',
  authenticateToken, requireEventRole('credential_desk'),
  async (req, res, next) => {
    try {
      const original = await db.query(
        'SELECT * FROM credentials WHERE id=$1 AND event_id=$2',
        [req.params.credentialId, req.params.eventId],
        { queryName: 'get_credential_for_reprint', requestId: req.requestId }
      );
      if (!original.rows[0]) return res.status(404).json({ error: 'Credential not found' });

      const client = await db.getClient();
      try {
        await client.query('BEGIN');

        const numResult = await client.query(
          `SELECT COALESCE(MAX(credential_number),0)+1 AS next_num FROM credentials WHERE event_id=$1 FOR UPDATE`,
          [req.params.eventId]
        );
        const credNum = numResult.rows[0].next_num;

        // Supersede old
        await client.query(
          `UPDATE credentials SET status='superseded' WHERE id=$1`,
          [req.params.credentialId]
        );

        const orig = original.rows[0];
        const r = await client.query(
          `INSERT INTO credentials
             (ticket_id,event_id,credential_number,stock,template_id,signed_payload,
              signing_key_id,printed_at,printed_by,status,reprint_of_credential_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8,'active',$9) RETURNING *`,
          [orig.ticket_id, req.params.eventId, credNum, orig.stock, orig.template_id,
           orig.signed_payload, orig.signing_key_id, req.user.userId, req.params.credentialId]
        );

        await client.query('COMMIT');
        res.status(201).json(r.rows[0]);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) { next(err); }
  }
);

module.exports = router;
