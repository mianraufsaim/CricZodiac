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
            SET status = 'blocked', updated_at = datetime('now'), sync_status = ?
            WHERE id = ?`,
      params: [SYNC_STATUS.PENDING, id],
    },
    {
      sql: `INSERT INTO sync_queue
              (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
            VALUES (?,?,?,?,?,?,datetime('now'))`,
      params: [
        uuid.v4(), 'users', 'update', id,
        JSON.stringify({ id, status: 'blocked' }),
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
              (id, name, email, phone, role, status, is_approved, club_id, local_password, sync_status)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
      params: [
        userId,
        data.name,
        data.email  || null,
        data.phone  || null,
        data.role,
        'active',
        1,
        data.club_id || null,
        data.password || null,
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

  // 3. If player role — create player profile
  //    SQLite players table: id, server_id, user_id, full_name, email, phone,
  //                          player_type, profile_pic, is_active, sync_status
  if (data.role === 'player') {
    statements.push({
      sql: `INSERT INTO players
              (id, user_id, club_id, full_name, email, phone, player_type,
               batting_hand, bowling_style, jersey_number, date_of_birth, sync_status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [
        playerId, userId,
        data.club_id || null,
        data.name,                    // full_name comes from users data
        data.email       || null,
        data.phone       || null,
        data.player_type || 'allrounder',
        data.batting_hand || 'right',
        data.bowling_style || null,
        data.jersey_number || null,
        data.date_of_birth || null,
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

// ── Update an existing user + player profile ──────────────
// localUserId  — SQLite UUID OR MySQL integer-as-string (when user has no local_id)
// data.role    — used to decide whether to upsert player profile
// data.player_local_id — player row's SQLite UUID (from server list response)
export const updateUserWithPlayer = async (localUserId, data) => {
  // Detect whether localUserId is a real UUID or just a MySQL integer id
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(localUserId);

  const statements = [];

  // Only update local SQLite if we have a real local record (UUID match)
  if (isUuid) {
    statements.push({
      sql: `UPDATE users
              SET name=?, email=?, phone=?, status=?, is_approved=?, club_id=?,
                  updated_at=datetime('now'), sync_status=?
              WHERE id=?`,
      params: [
        data.name,
        data.email       || null,
        data.phone       || null,
        data.status      || 'active',
        data.is_approved != null ? (data.is_approved ? 1 : 0) : 1,
        data.club_id     || null,
        SYNC_STATUS.PENDING,
        localUserId,
      ],
    });
  }

  // Sync queue — always push to server regardless of local record
  statements.push({
    sql: `INSERT INTO sync_queue
            (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
          VALUES (?,?,?,?,?,?,datetime('now'))`,
    params: [
      uuid.v4(), 'users', 'update', localUserId,
      JSON.stringify({
        id:          localUserId,          // UUID → server uses local_id; integer → server uses id
        name:        data.name,
        email:       data.email       || null,
        phone:       data.phone       || null,
        status:      data.status      || 'active',
        is_approved: data.is_approved != null ? (data.is_approved ? 1 : 0) : 1,
        ...(data.new_password ? { password: data.new_password } : {}),
      }),
      SYNC_STATUS.PENDING,
    ],
  });

  if (data.role === 'player') {
    // Prefer server-returned player_local_id; fall back to local SQLite lookup
    let playerLocalId = data.player_local_id || null;
    if (!playerLocalId) {
      const existing = await queryFirstRow(
        `SELECT id FROM players WHERE user_id = ?`, [localUserId]
      );
      playerLocalId = existing?.id || null;
    }

    if (playerLocalId) {
      // UPDATE existing player profile
      statements.push({
        sql: `UPDATE players
              SET player_type=?, batting_hand=?, bowling_style=?,
                  jersey_number=?, date_of_birth=?,
                  updated_at=datetime('now'), sync_status=?
              WHERE id=?`,
        params: [
          data.player_type   || 'allrounder',
          data.batting_hand  || 'right',
          data.bowling_style || null,
          data.jersey_number || null,
          data.date_of_birth || null,
          SYNC_STATUS.PENDING,
          playerLocalId,
        ],
      });
      statements.push({
        sql: `INSERT INTO sync_queue
                (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
              VALUES (?,?,?,?,?,?,datetime('now'))`,
        params: [
          uuid.v4(), 'players', 'update', playerLocalId,
          JSON.stringify({
            id:            playerLocalId,
            user_id:       localUserId,
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
    } else {
      // No player profile yet — create one
      const newPlayerId = uuid.v4();
      statements.push({
        sql: `INSERT INTO players
                (id, user_id, club_id, full_name, email, phone, player_type,
                 batting_hand, bowling_style, jersey_number, date_of_birth, sync_status)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        params: [
          newPlayerId, localUserId,
          data.club_id       || null,
          data.name,
          data.email         || null,
          data.phone         || null,
          data.player_type   || 'allrounder',
          data.batting_hand  || 'right',
          data.bowling_style || null,
          data.jersey_number || null,
          data.date_of_birth || null,
          SYNC_STATUS.PENDING,
        ],
      });
      statements.push({
        sql: `INSERT INTO sync_queue
                (event_id, table_name, action_type, local_id, payload_json, sync_status, created_at)
              VALUES (?,?,?,?,?,?,datetime('now'))`,
        params: [
          uuid.v4(), 'players', 'create', newPlayerId,
          JSON.stringify({
            id:            newPlayerId,
            user_id:       localUserId,
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
  }

  await executeTransaction(statements);
};
