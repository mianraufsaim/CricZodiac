-- ============================================================
-- CricZodiac — Seed Data  (v2)
-- Run AFTER schema.sql
-- ============================================================

USE criczodiac;

-- ── Default Super Admin ────────────────────────────────────
-- Role    : super_admin  (Zodiac Technologies staff)
-- Email   : admin@criczodiac.com
-- Password: Admin@123
--
-- Generate a fresh hash before deploying:
--   php -r "echo password_hash('Admin@123', PASSWORD_BCRYPT, ['cost'=>12]);"
--
-- ⚠️  Change the password immediately after first login!

INSERT IGNORE INTO users (
    name,
    email,
    phone,
    password_hash,
    role,
    status,
    is_approved,
    club_id,
    created_at
) VALUES (
    'Super Admin',
    'admin@criczodiac.com',
    NULL,
    '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',  -- bcrypt of "Admin@123"
    'super_admin',
    'active',
    1,
    NULL,   -- super_admin has no club
    NOW()
);

-- ── Notes ─────────────────────────────────────────────────
-- Club admins are created via the app Register screen (role = 'admin').
-- Umpires and players are created inside the app by admins/umpires.
-- No other seed data needed — all records are synced from the mobile app.
