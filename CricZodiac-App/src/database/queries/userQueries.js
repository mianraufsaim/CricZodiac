// ============================================================
// CricZodiac — User Database Queries (Local SQLite)
// ============================================================

import { queryRows, queryFirstRow, executeTransaction, executeQuery } from '../DatabaseHelper';
import { SYNC_STATUS } from '../../config/constants';
import uuid from 'react-native-uuid';

// ── Get all users (optionally filtered by role) ───────────
export const getAllUsers = (role = null) => {
  if (role) {
    return queryRows(
      `SELECT * FROM users WHERE role = ? ORDER BY name ASC`,
      [role]
    );
  }
  return queryRows(`SELECT * FROM users ORDER BY role ASC, name ASC`);
};

// ── Get single user ───────────────────────────────────────
export const getUserById = (id) =>
  queryFirstRow('SELECT * FROM users WHERE id = ?', [id]);

// ── Create a new umpire (local + sync queue) ──────────────
export const createUmpire = async (data) => {
  const id = uuid.v4();
  await executeTransaction([
    {
      sql: `INSERT INTO users
              (id, name, email, phone, role, status, is_approved, sync_status)
            VALUES (?,?,?,?,?,?,?,?)`,
      params: [
        id,
        data.name,
        data.email   || null,
        data.phone   || null,
        'umpire',
        'active',
        1,             // admin-created users are pre-approved
        SYNC_STATUS.PENDING,
      ],
    },
    {
      sql: `INSERT INTO sync_queue
              (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [
        uuid.v4(), 'users', 'create', id,
        JSON.stringify({ id, ...data, role: 'umpire', status: 'active', is_approved: 1 }),
        SYNC_STATUS.PENDING,
      ],
    },
  ]);
  return id;
};

// ── Change a user's role ──────────────────────────────────
export const changeUserRole = async (id, newRole) => {
  await executeTransaction([
    {
      sql: `UPDATE users
            SET role = ?, updated_at = datetime('now'), sync_status = ?
            WHERE id = ?`,
      params: [newRole, SYNC_STATUS.PENDING, id],
    },
    {
      sql: `INSERT INTO sync_queue
              (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [
        uuid.v4(), 'users', 'update', id,
        JSON.stringify({ id, role: newRole }),
        SYNC_STATUS.PENDING,
      ],
    },
  ]);
};

// ── Approve / reject a user ───────────────────────────────
export const setUserApproval = async (id, approved) => {
  const val = approved ? 1 : 0;
  await executeTransaction([
    {
      sql: `UPDATE users
            SET is_approved = ?, updated_at = datetime('now'), sync_status = ?
            WHERE id = ?`,
      params: [val, SYNC_STATUS.PENDING, id],
    },
    {
      sql: `INSERT INTO sync_queue
              (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [
        uuid.v4(), 'users', 'update', id,
        JSON.stringify({ id, is_approved: val }),
        SYNC_STATUS.PENDING,
      ],
    },
  ]);
};

// ── Deactivate (soft-delete) a user ───────────────────────
export const deactivateUser = async (id) => {
  await executeTransaction([
    {
      sql: `UPDATE users
            SET status = 'inactive', updated_at = datetime('now'), sync_status = ?
            WHERE id = ?`,
      params: [SYNC_STATUS.PENDING, id],
    },
    {
      sql: `INSERT INTO sync_queue
              (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [
        uuid.v4(), 'users', 'update', id,
        JSON.stringify({ id, status: 'inactive' }),
        SYNC_STATUS.PENDING,
      ],
    },
  ]);
};

// ── Hard-delete a user from local DB ─────────────────────
export const deleteUserLocal = async (id) => {
  await executeQuery(`DELETE FROM users WHERE id = ?`, [id]);
};

// ── Create a user (umpire OR player) with optional linked player profile ──────
// data.role = 'umpire' | 'player'
// data.password must be provided (plaintext, sent to server in sync payload only)
export const createUserWithPlayer = async (data) => {
  const userId   = uuid.v4();
  const playerId = data.role === 'player' ? uuid.v4() : null;

  const statements = [
    // 1. User record
    {
      sql: `INSERT INTO users
              (id, name, email, phone, role, status, is_approved, sync_status)
            VALUES (?,?,?,?,?,?,?,?)`,
      params: [
        userId,
        data.name,
        data.email  || null,
        data.phone  || null,
        data.role,
        'active',
        1,
        SYNC_STATUS.PENDING,
      ],
    },
    // 2. Sync queue for user (includes password for server)
    {
      sql: `INSERT INTO sync_queue
              (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [
        uuid.v4(), 'users', 'create', userId,
        JSON.stringify({
          id: userId,
          name: data.name,
          email: data.email  || null,
          phone: data.phone  || null,
          role: data.role,
          password: data.password,   // plaintext — server hashes this
          status: 'active',
          is_approved: 1,
          club_id: data.club_id || null,
        }),
        SYNC_STATUS.PENDING,
      ],
    },
  ];

  // 3. If player role — create player profile (additional data only; name/email/phone live in users)
  if (data.role === 'player') {
    statements.push({
      sql: `INSERT INTO players
              (id, user_id, club_id, player_type, batting_hand, bowling_style, jersey_number, date_of_birth, sync_status)
            VALUES (?,?,?,?,?,?,?,?,?)`,
      params: [
        playerId, userId,
        data.club_id         || null,
        data.player_type     || 'allrounder',
        data.batting_hand    || 'right',
        data.bowling_style   || null,
        data.jersey_number   || null,
        data.date_of_birth   || null,
        SYNC_STATUS.PENDING,
      ],
    });
    statements.push({
      sql: `INSERT INTO sync_queue
              (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [
        uuid.v4(), 'players', 'create', playerId,
        JSON.stringify({
          id: playerId, user_id: userId,
          player_type:   data.player_type   || 'allrounder',
          batting_hand:  data.batting_hand  || 'right',
          bowling_style: data.bowling_style || null,
          jersey_number: data.jersey_number || null,
          date_of_birth: data.date_of_birth || null,
          club_id:       data.club_id       || null,
        }),
        SYNC_STATUS.PENDING,
      ],
    });
  }

  await executeTransaction(statements);
  return { userId, playerId };
};
