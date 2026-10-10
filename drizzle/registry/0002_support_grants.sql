-- =============================================================================
-- Support grants (control plane) — MULTI_HOUSEHOLD_PLAN §4.
--
-- A household member explicitly grants a platform administrator a time-limited,
-- read-only support view of that household. The grant row is consent metadata
-- only: no finance records, no snapshot of any household data. The grant is
-- validated on every request against the verified sign-in and this table, so
-- revocation and expiry take effect immediately.
--
-- `scope` is read-only by design; the CHECK keeps a future write scope from
-- appearing without a new, reviewed migration.
-- =============================================================================

CREATE TABLE support_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE RESTRICT,
  -- Normalised email of the platform administrator the household chose.
  support_email TEXT NOT NULL,
  -- Normalised email of the household member who granted it.
  granted_by_email TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'read' CHECK (scope = 'read'),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by_email TEXT,
  -- Recorded once, on the first request made under the grant, and refreshed
  -- (throttled) afterwards so the household can see whether it was used.
  first_used_at TEXT,
  last_used_at TEXT
);

CREATE INDEX support_grants_household_idx ON support_grants (household_id);
CREATE INDEX support_grants_support_idx ON support_grants (support_email);
