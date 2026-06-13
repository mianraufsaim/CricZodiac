// ============================================================
// CricZodiac — Club Queries
// ============================================================

import uuid from 'react-native-uuid';
import { queryRows, queryFirstRow, executeTransaction } from '../DatabaseHelper';

// ── Fetch ─────────────────────────────────────────────────

/** All clubs (super admin view) */
export const getAllClubs = () =>
  queryRows('SELECT * FROM clubs WHERE status != ? ORDER BY name ASC', ['deleted']);

/** Clubs managed by a specific admin user */
export const getClubsForAdmin = (adminUserId) =>
  queryRows(
    `SELECT c.* FROM clubs c
     INNER JOIN users u ON u.club_id = c.id
     WHERE u.id = ? AND c.status = 'active'
     ORDER BY c.name ASC`,
    [adminUserId]
  );

/** Single club by local id */
export const getClub = (clubId) =>
  queryFirstRow('SELECT * FROM clubs WHERE id = ?', [clubId]);

// ── Create ────────────────────────────────────────────────

export const createClub = async ({ name, country = '', city = '', contact_email = '', logo_url = '' }) => {
  const id = uuid.v4();
  const now = new Date().toISOString();
  const eventId = uuid.v4();

  await executeTransaction([
    {
      sql: `INSERT INTO clubs (id, name, country, city, contact_email, logo_url, status, created_at, updated_at, sync_status)
            VALUES (?,?,?,?,?,?,'active',?,?,'pending')`,
      params: [id, name, country, city, contact_email, logo_url, now, now],
    },
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status)
            VALUES (?,?,?,?,?,?)`,
      params: [
        eventId, 'clubs', 'INSERT', id,
        JSON.stringify({ id, name, country, city, contact_email, logo_url, created_at: now }),
        'pending',
      ],
    },
  ]);
  return id;
};

// ── Update ────────────────────────────────────────────────

export const updateClub = async (clubId, { name, country, city, contact_email, logo_url, status }) => {
  const now = new Date().toISOString();
  const eventId = uuid.v4();
  const payload = { id: clubId, name, country, city, contact_email, logo_url, status, updated_at: now };

  await executeTransaction([
    {
      sql: `UPDATE clubs SET name=?, country=?, city=?, contact_email=?, logo_url=?, status=?, updated_at=?, sync_status='pending'
            WHERE id=?`,
      params: [name, country, city, contact_email, logo_url, status, now, clubId],
    },
    {
      sql: `INSERT INTO sync_queue (event_id, table_name, action_type, local_id, payload_json, sync_status)
            VALUES (?,?,?,?,?,?)`,
      params: [eventId, 'clubs', 'UPDATE', clubId, JSON.stringify(payload), 'pending'],
    },
  ]);
};
