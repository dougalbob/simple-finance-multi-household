# Release notes — v1.46.1 — Void a settlement on a closed claim, reopening it

**Stable patch release.** This build moves `latest` and is marked Latest on GitHub.
Version badge: **v1.46.1 · stable**.

## What changed

A claim closes as soon as its awaited figure falls to zero — including when the money has not actually
moved, which is how a claim meant to sit awaiting an estate payment can end up closed by an accidental
settle. Voiding that settlement used to be unreachable in the screens once the claim closed: the Void
control renders only on open claims, so a prematurely closed claim could not be reopened, its linked
purchases stayed reserved forever, and there was no way to settle it properly afterwards (issue: the
settlement's Void was only shown on open claims, reported by the household after the v1.46.0 update).

v1.46.1 renders the claim's settlement rows — with their Void controls — inside the **Settled and
closed** disclosure on the Borrowing page's **Money owed to us** card, for every closed claim that
carries a live settlement. One Void with a reason:

- the settlement is voided (history is kept, everything is audited),
- the claim **reopens** with its pre-settlement awaited figure,
- the purchases stay linked to the same claim — nothing to re-tick,
- no other record changes: linked income records are kept (money that really arrived is never
  un-recorded), so any income entry made by mistake must be voided on its own page as usual.

No schema change, no migration (`0023` from v1.46.0 remains the latest), no change to settlement
semantics — only the reachability of the existing, tested void action in the UI.

## Who is affected and what to do

Anyone who closed a claim in v1.46.0 by accident and cannot select its purchases for a new claim.

1. Update (Unraid **Force Update** after backing up the households and the Admin registry, or a fresh
   pull/build).
2. Borrowing → **Money owed to us — expected back** → open **Settled and closed**.
3. Find the claim; its settled row now shows **Void** beside it (with a short hint).
4. Void the settlement with the real reason (e.g. `entered in error — money has not moved`).
5. The claim reappears in **Money owed to us — expected back** with its purchases linked and its
   awaited figure restored. Settle it properly when the money actually moves.
6. If the accidental settlement was routed **The money arrived**, also void that income entry on the
   **Income** page with the same reason — the two records are separate on purpose.

## Validation

- Unit suite: 1,328/1,328 across 300 suites (domain behaviour unchanged).
- `e2e/claims.spec.ts` gains `voiding a settlement on a closed claim reopens it — the purchases stay
  linked`, which settles a claim, watches it close, voids the settlement from the **Settled and
  closed** disclosure and asserts the claim reopens with its purchases linked (browser gate).
- `npx tsc --noEmit`, `format:check`, `themes:check`, production build: clean.

## Upgrading on Unraid

Back up each household and the Admin registry first, then **Force Update** the **Simple Finance
Multi-household** container using `ghcr.io/dougalbob/simple-finance-multi-household:latest` (or pin
`:v1.46.1`). The container applies any outstanding migrations at start-up (this release adds none).
Only the multi-household appdata (`/mnt/user/appdata/simple-finance-multi-household`) on port 3009 is
target; never the original installation on 3007.

Version badge after update: **v1.46.1 · stable**.
