-- =============================================================================
-- Presence (control plane) — GitHub issue #105.
--
-- The app has no server-side session: every request re-verifies the Cloudflare
-- Access assertion (src/lib/auth/current-user.ts), so "connected" can only be
-- inferred from recent activity. This table records that inference and nothing
-- else: which assigned identity was seen, from which browser tab, and when.
--
-- Deliberately absent: page paths, search terms, finance data, IP addresses,
-- user-agent strings and which household a support view was looking at. A row
-- says that someone was using the app, never what they were doing with it.
--
-- `household_id` is the identity's own registry assignment (the household the
-- person belongs to), never a support grant's target household. Households are
-- never deleted (deactivation is the removal), so ON DELETE RESTRICT matches
-- the rest of the control plane.
--
-- One open row per (email, session_key): the partial unique index is what makes
-- a returning tab start a new visit instead of reviving an ended one, so the
-- history keeps both visits. `ended_at` is written lazily by the next read or
-- touch (see src/lib/registry/presence.ts) — there is no background timer.
-- =============================================================================

CREATE TABLE presence_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Normalised sign-in email, exactly as the registry roster holds it.
  email TEXT NOT NULL,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE RESTRICT,
  -- Opaque per-tab key generated in the browser (never a credential and never
  -- trusted for identity — the verified session decides who is present).
  session_key TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  ended_at TEXT,
  -- Only the idle sweep ends a visit today; a new value needs its own reason.
  ended_reason TEXT CHECK (ended_reason IS NULL OR ended_reason IN ('idle-timeout'))
);

CREATE UNIQUE INDEX presence_sessions_open_unique
  ON presence_sessions (email, session_key)
  WHERE ended_at IS NULL;

CREATE INDEX presence_sessions_last_seen_idx ON presence_sessions (last_seen_at);
CREATE INDEX presence_sessions_household_idx ON presence_sessions (household_id);
CREATE INDEX presence_sessions_email_idx ON presence_sessions (email);
