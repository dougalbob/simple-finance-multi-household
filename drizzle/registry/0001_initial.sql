-- =============================================================================
-- System registry (control plane) — initial schema.
--
-- The registry lives at <dataDir>/system/registry.sqlite and holds household
-- roster, identity-to-household assignments, platform-administrator roles and
-- (later) support grants — membership/admin metadata ONLY. It must never
-- contain purchases, balances, receipts or any other finance record; those
-- live in each household's own database (docs/MULTI_HOUSEHOLD_PLAN.md §3,
-- docs/SPEC.md §18.1).
--
-- Migrations here are applied by the versioned runners in
-- `src/lib/registry/schema.ts` (app/tests) and `scripts/registry-migrate.cjs`
-- (production entrypoint). Both read this folder; the SQL is this one file.
-- A migration's numbered filename is its ordering key once shipped — never
-- edit a shipped file (the finance-journal rule, decision 172, applies here
-- too); add a new numbered file instead.
-- =============================================================================

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Normalised (trimmed, lower-cased) sign-in email. Unique across the whole
  -- installation: one identity belongs to exactly one household (SPEC §3).
  email TEXT NOT NULL,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE RESTRICT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'platform_admin')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX identities_email_unique ON identities (email);

-- Administrator-visible operational log: every roster change, who made it and
-- when. Households' finance audits stay in each household's own database.
CREATE TABLE registry_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  email TEXT,
  household_id TEXT,
  detail TEXT
);

CREATE INDEX registry_audit_at_idx ON registry_audit (at);
