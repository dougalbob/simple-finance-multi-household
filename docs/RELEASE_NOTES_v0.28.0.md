# Release notes — v0.28.0 — Checkpoint cash, pot owners, and the Accounts, Pots & Checkpoints page

## For the household

- **Checkpoint cash at the till.** Quick Entry now has a collapsed **Checkpoint cash** button
  between the "Record it while it is fresh" heading and the description line. It opens a small card
  with **your own cash pot** already on it — the app knows which pot is yours because cash pots now
  carry an **Owner** (see below) — a counted amount, an optional note, and Save. The card shows
  when you last counted ("Last counted 2 days ago"), never a stale amount. After saving, the amount
  clears so a second tap cannot record the same figure twice. The full Balance tab is unchanged for
  every other pot.
- **Cash pots have an Owner.** When you add or edit a pot there is an Owner choice
  ("Shared / not assigned" or a person), like a vehicle's Owner. The Checkpoint cash card opens the
  signed-in person's own cash pot through that link — nothing is guessed from a pot's name. If your
  sign-in isn't linked to a person with an owned cash pot, the card falls back to a short list of
  the cash pots so it always works.
- **Cash pot cards are tidier.** On the pots page, cash pot cards no longer show the overdraft
  limit and warning threshold — those belong to bank accounts and credit cards, not counted notes.
  The app also clears any limit/threshold that a cash pot carried (they were never used), and a
  pot switched to cash has them cleared too. Bank and card cards are unchanged.
- **The pots page leads with recording.** "Record a balance checkpoint" is now the first card,
  "Add a pot" the second, and the pot cards follow. The page label is now **Accounts, Pots &
  Checkpoints** (was "Accounts & Pots") — the navigation entry and the links from other pages use
  the new name too.

## Upgrade

**This release changes the database** (migration `0015_pot_owner`): a new nullable
`pots.owner_person_id` column, and any overdraft/threshold values on cash pots are cleared. The
migration is additive and runs on startup; nothing else about your data moves. Take a backup in
Settings first (there is no downgrade path), then Force Update in Unraid. After the update, open
Accounts, Pots & Checkpoints → Edit pot on each cash pot and set its Owner once — that is what
makes the till's Checkpoint cash card lock onto your own pot. The seed e-mail link ("Signs in as")
is unchanged.

## Engineering

Decision 178; SPEC §4, §15.1 and §15.2. Migration 0015 (generated with drizzle-kit, then extended
with the cash-pot normalisation before shipping; journal stamp is a real-clock stamp strictly after
0014, as the migrate-journal guard requires). Domain: `createPot`/`editPot` take and validate an
owner (unknown person refused), and cash pots carry no limit/threshold on any path — the same
"not-applicable means null" shape the card settings already use. Till data gains `ownerPersonId`
and a cash-only `cashLastCountedLabel` (the age of the last count, never the amount — §15.1's
no-stale-cash-figures rule stands). Unit coverage: owner create/edit validation, cash clearing,
migration 0015 upgrade with a legacy cash pot carrying limits, and the entry-data fields. Browser
coverage: a new `cash-checkpoint` project — the card locked on Alex's cash with a save that
updates the estimates in place, the phone till header, the /pots card order and the cash-card
fields, and the no-owner fallback through the real Edit pot form. Version 0.28.0 is updated in
package metadata, APP_VERSION and the Unraid template.
