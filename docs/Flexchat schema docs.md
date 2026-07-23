# FlexChat Database Schema — Explanation

This document explains every table, enum, index, trigger, and function in the two SQL files, what it's used for, and why it exists.

---

## 1. Extensions

| Extension | Purpose |
|---|---|
| `pgcrypto` | Provides `gen_random_uuid()`, used everywhere as the default for `id` primary keys (instead of auto-increment integers). UUIDs are used so IDs are unguessable and safe to expose in APIs/URLs. |
| `pg_cron` | Lets Postgres run scheduled jobs directly inside the database (used later to auto-delete expired sessions). |

---

## 2. Enums (fixed sets of allowed values)

| Enum | Values | Used for |
|---|---|---|
| `account_status_enum` | `active`, `suspended`, `blocked` | Tracks whether a user account is in good standing, temporarily suspended, or permanently blocked. |
| `activity_status_enum` | `active`, `inactive` | Tracks whether a login session is currently active or has ended. |
| `friend_request_status_enum` | `pending`, `accepted`, `rejected`, `blocked`, `none` | Tracks the state of a 1-to-1 friend/DM relationship between two users (stored on the `chats` row for a DM). |
| `join_request_status_enum` | `pending`, `approved`, `rejected` | Tracks the state of a request to join a group chat. |

**Why enums instead of plain text?** They restrict the column to a known list of values at the database level, so invalid statuses (typos like `"activ"`) can never be inserted — this is cheaper and safer than checking in application code alone.

---

## 3. `users` table

Stores one row per registered user.

| Column | Purpose |
|---|---|
| `id` | Internal UUID primary key (used for all foreign keys). |
| `user_id` | Public-facing short handle (e.g. `@soumydip`) — what other users see/search, separate from the internal UUID so the internal ID never needs to be exposed. |
| `name`, `email`, `password` | Basic identity + bcrypt-hashed password (never store plain text passwords). |
| `is_email_verified` | Gate for features that require a verified email. |
| `account_status` | Uses `account_status_enum` — lets you suspend/block a user without deleting their data. |
| `login_attempts`, `locked_until` | Basic brute-force protection — count failed logins and temporarily lock the account. |
| `profile_image`, `profile_image_key` | The public URL of the profile picture, plus the storage key/path (needed to delete/replace the file in object storage later). |
| `bio`, `website`, `location` | Optional profile fields; `location` is `JSONB` so it can hold structured data (lat/lng, city, country) without needing separate columns. |
| `last_login`, `last_logout` | Quick lookup of most recent activity without querying `user_activities`. |
| `created_at`, `updated_at` | Standard audit timestamps. |

**Indexes:**
- `idx_users_email`, `idx_users_user_id` — these are looked up constantly (login, search, mentions), so they're indexed for speed.
- `idx_users_account_status` — lets admin/moderation queries quickly filter e.g. all `blocked` users.

**Trigger — `trg_users_updated_at`:**
Automatically sets `updated_at = now()` on every `UPDATE`, using the shared `set_updated_at()` function. This means the application never has to remember to set this column manually — the database guarantees it's always correct.

---

## 4. `set_updated_at()` function

A single reusable trigger function that just sets `NEW.updated_at = now()`. It's attached to multiple tables (`users`, `chats`, `backup_keys`, `user_activities`) instead of writing the same trigger logic four times — one function, reused everywhere.

---

## 5. `user_activities` table

Stores one row per login session (a session/device log), separate from `users`, because a user can have many sessions over time.

| Column | Purpose |
|---|---|
| `user_id` | Which user this session belongs to. |
| `login_time`, `logout_time` | Session start/end. |
| `ip_address`, `device_info`, `location` | Security/audit info — lets a user see "logged in from Kolkata on Chrome/Windows," or lets you detect suspicious logins. `device_info`/`location` are JSONB for flexible structured data. |
| `session_id` | The actual session/token identifier used by the app to validate requests. |
| `status` | `active`/`inactive` — whether this session is still valid. |
| `session_expires_at` | When the session should auto-expire. |
| `fingerprint_id` | A unique device fingerprint — likely used to detect/prevent the same device from creating multiple accounts, or for "remember this device" logic. Marked `UNIQUE`. |

**Indexes:** on `user_id`, `session_id`, `status`, `login_time` — because sessions are looked up by user (list your devices), by token (validate a request), by status (find all active sessions), and by time (recent activity/audit).

**pg_cron job — `delete-expired-sessions`:**
Runs every day at midnight and deletes rows where `session_expires_at < now()`. This is automatic housekeeping so expired sessions don't pile up forever — the database cleans itself without needing a backend cron job/worker.

---

## 6. `chats` table

Represents **either** a 1-to-1 direct message **or** a group chat — both live in the same table, distinguished by `is_group_chat`.

| Column | Purpose |
|---|---|
| `custom_chat_id` | A separate public-facing chat ID (UUID as text), decoupled from the internal `id` — same pattern as `users.user_id` vs `users.id`. |
| `is_group_chat` | `TRUE` = group, `FALSE` = 1-to-1 DM. |
| `friend_request_status` | Only meaningful for DMs — tracks whether the two people are friends yet, pending, blocked, etc. |
| `group_name`, `group_avatar_url`, `group_description` | Only meaningful when `is_group_chat = TRUE`. |
| `can_forward_messages` | A per-chat toggle — group admins (or DM participants) can disable message forwarding. |
| `created_by` | Who created the chat/group. Uses `ON DELETE SET NULL` so if the creator's account is deleted, the chat itself isn't deleted — just loses the "created by" reference. |
| `last_message_id` | Cached pointer to the most recent message, so the chat list screen doesn't need to run an expensive "get last message per chat" query every time — it just joins on this ID. |
| `group_settings` *(added later)* | `JSONB` catch-all for flexible group settings like `isAdminInvitationsAllowed` — instead of adding a new boolean column every time a new group setting is needed, they go into this flexible field. |

**Indexes:**
- `idx_chats_created_at` — chat lists are usually sorted by recency.
- `idx_chats_is_group_chat` — quickly filter DMs vs groups.
- `idx_chats_last_message` — supports the "last message" join mentioned above.

**Trigger:** same `updated_at` auto-update pattern as `users`.

---

## 7. `chat_participants` table

A many-to-many join table linking `users` ↔ `chats` (who is in which chat).

| Column | Purpose |
|---|---|
| `chat_id`, `user_id` | Composite primary key — one row per (chat, user) pair, so a user can't be added twice to the same chat. |
| `is_admin` | Group admin flag (irrelevant for DMs). |
| `is_pinned` | Whether this user has pinned this chat to the top of their chat list. |
| `is_favorite` | Whether this user has marked this chat as a favorite. |
| `is_locked` | Likely a per-user lock (e.g. app-lock/PIN-protected chat), stored per participant since it's a personal preference, not shared with the whole group. |
| `joined_at` | When this user joined the chat. |

**Why per-user flags here instead of on `chats`?** Because pinning/favoriting/locking is *personal* — each participant can pin the same chat differently, so it must live on the join row, not on the shared `chats` row.

**Indexes:**
- `idx_chat_participants_chat_id` — "who's in this chat" (member list).
- `idx_chat_participants_user_id` — "which chats is this user in" (their chat list).
- `idx_chat_participants_pinned` — a **partial index** (`WHERE is_pinned = TRUE`) — much smaller/faster than indexing the whole table, since only pinned rows are a small minority and that's the only case this index needs to serve.

---

## 8. `backup_keys` table

Stores end-to-end encryption key material for each user (one row per user, enforced by `UNIQUE` on `user_id`).

| Column | Purpose |
|---|---|
| `public_key_64`, `salt_b64` | Public key + salt used in the E2EE key derivation scheme. |
| `enc_backup_key_ct_b64`, `enc_backup_key_iv_b64` | The user's encrypted backup key (ciphertext + IV) — lets a user recover their encryption keys on a new device, without the server ever seeing the unencrypted key. |
| `identity_enc_priv_key_b64`, `identity_priv_key_iv_b64` | Encrypted private identity key (for encrypting messages) + its IV. |
| `identity_sig_key_b64`, `identity_sig_key_iv_b64` | Encrypted private signing key (for verifying message authenticity) + its IV. |
| `is_mfa_enabled`, `mfa_secret` | Multi-factor authentication toggle + secret, stored alongside key material since both are security-sensitive per-user data. |

**Why a separate table instead of columns on `users`?** Separation of concerns — this is sensitive cryptographic material accessed far less often than basic profile data, and keeping it separate makes it easier to apply stricter access rules to just this table.

**Trigger:** same `updated_at` auto-update pattern.

---

## 9. `group_join_requests` table

Tracks requests from users who want to join a group chat (for groups that require admin approval).

| Column | Purpose |
|---|---|
| `chat_id` | Which group. |
| `requested_by` | Who wants to join. |
| `invited_by` | If someone invited them (vs. they requested on their own), who invited them. Nullable + `ON DELETE SET NULL`, since the inviter leaving shouldn't delete the request. |
| `status` | `pending` / `approved` / `rejected`. |
| `reviewed_by`, `reviewed_at` | Which admin reviewed the request, and when. |

**Indexes:**
- `idx_join_requests_chat_status` — the main query pattern: "show all pending requests for this group" (admin's approval queue).
- `idx_join_requests_requested_by` — "show all my pending join requests" (user's own view).

---

## 10. RPC Functions (atomic multi-step operations)

These are Postgres functions called directly from the app (e.g. via Supabase RPC) so that multiple related writes happen as **one atomic transaction** — either all succeed or none do, which plain sequential API calls from the backend can't guarantee as cleanly.

### `create_group_chat(...)`
Creates a new group chat **and** inserts all its participants in one call:
1. Inserts a row into `chats` with `is_group_chat = TRUE` and a fresh `custom_chat_id`.
2. Adds the creator as a participant with `is_admin = TRUE`.
3. Loops through the given participant list and adds each one as a normal member (`is_admin = FALSE`), skipping the creator if they're in the list twice.
4. Uses `ON CONFLICT ... DO NOTHING` so it's safe even if a duplicate participant slips in.
5. Returns the new chat's internal `id` and its public `custom_chat_id`.

**Why this matters:** without this, the app would need to do 1 insert for the chat + N inserts for participants as separate calls — risking a chat existing with zero members if something fails halfway.

### `approve_join_request(p_request_id, p_admin_id)`
Handles an admin approving someone's join request, with all the validation done inside the database transaction:
1. Looks up the request; if it doesn't exist → returns `'not_found'`.
2. If it's already been reviewed → returns `'not_pending'`.
3. Checks the approver is actually an admin of that chat → otherwise `'not_admin'`.
4. Checks if the requester is already a member (edge case, e.g. they joined another way) → marks the request approved anyway and returns `'already_member'`.
5. Checks the group hasn't hit the 100-member cap → otherwise `'limit_reached'`.
6. Otherwise, inserts the new participant and marks the request `'approved'`.

**Why a function instead of app-side logic?** All these checks (admin permission, duplicate membership, member limit) happen atomically in the database — no race condition where two admins approve two different requests at the same instant and accidentally push the group over 100 members.

---

## Summary of design patterns used throughout

- **UUID primary keys everywhere** — safe to expose, no sequential-guessing.
- **Public ID vs internal ID** (`user_id` vs `id`, `custom_chat_id` vs `id`) — internal IDs never leak to clients.
- **JSONB for flexible/evolving fields** (`location`, `device_info`, `group_settings`) — avoids constant schema migrations for optional/variable data.
- **Enums for fixed-state fields** — database-level validation of status values.
- **`ON DELETE CASCADE` vs `ON DELETE SET NULL`** — cascade when the child row is meaningless without the parent (e.g. a participant row without the user), `SET NULL` when the row should survive (e.g. a chat should survive even if its creator's account is deleted).
- **Shared `set_updated_at()` trigger** — DRY, guarantees timestamps are always correct without relying on app code.
- **Partial indexes** (`WHERE is_pinned = TRUE`) — smaller, faster indexes for queries that only care about a subset of rows.
- **Atomic RPC functions** for multi-step writes — avoids partial/inconsistent states from multi-request app-side logic.