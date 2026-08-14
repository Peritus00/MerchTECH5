'use strict';
/**
 * requireEventRole middleware
 *
 * Checks event_staff for `:eventId` param, falling back to users.is_admin.
 * PII filtering: strips attendee PII fields for door_scanner role.
 *
 * Usage:
 *   router.get('/...', authenticateToken, requireEventRole('door_scanner'), handler)
 *   router.post('/...', authenticateToken, requireEventRole('event_manager', 'super_admin'), handler)
 */

const db = require('../config/database');
const { canManageRole, ROLE_HIERARCHY } = require('../lib/tokenEvaluation');

/**
 * Returns middleware that allows access if the user has any of the specified roles
 * (or higher in the hierarchy) for the event, or is a platform super_admin.
 *
 * @param {...string} allowedRoles - minimum required role(s); at least one must match
 */
function requireEventRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.userId;
      const eventId = req.params.eventId || req.params.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized', code: 'NO_AUTH' });
      }

      // Platform super admins always pass
      const adminCheck = await db.query(
        'SELECT is_admin FROM users WHERE id = $1',
        [userId],
        { queryName: 'requireEventRole_admin', requestId: req.requestId }
      );
      if (adminCheck.rows[0]?.is_admin) {
        req.eventRole = 'super_admin';
        return next();
      }

      if (!eventId) {
        return res.status(400).json({ error: 'Missing eventId', code: 'NO_EVENT_ID' });
      }

      // Look up event staff role
      const staffResult = await db.query(
        `SELECT role FROM event_staff
         WHERE event_id = $1 AND user_id = $2 AND revoked_at IS NULL
         LIMIT 1`,
        [eventId, userId],
        { queryName: 'requireEventRole_staff', requestId: req.requestId }
      );

      const userRole = staffResult.rows[0]?.role;
      if (!userRole) {
        return res.status(403).json({ error: 'Not a staff member for this event', code: 'NOT_STAFF' });
      }

      // Check if user's role satisfies any of the allowed roles
      const userRoleIndex = ROLE_HIERARCHY.indexOf(userRole);
      const allowed = allowedRoles.some(r => {
        const requiredIndex = ROLE_HIERARCHY.indexOf(r);
        return userRoleIndex >= requiredIndex;
      });

      if (!allowed) {
        return res.status(403).json({ error: 'Insufficient event role', code: 'INSUFFICIENT_ROLE' });
      }

      req.eventRole = userRole;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Strips PII fields from an attendee object for door_scanner role.
 * door_scanners only receive: id, has_photo, photo_status, access_level_id, ticket_id, public_code
 */
function filterAttendeePII(attendee, role) {
  if (role === 'door_scanner') {
    return {
      id: attendee.id,
      ticket_id: attendee.ticket_id,
      public_code: attendee.public_code,
      access_level_id: attendee.access_level_id,
      has_photo: !!attendee.photo_s3_key,
      photo_status: attendee.photo_status,
    };
  }
  return attendee;
}

module.exports = { requireEventRole, filterAttendeePII };
