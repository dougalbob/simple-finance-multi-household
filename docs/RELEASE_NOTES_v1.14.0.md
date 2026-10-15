# Release notes — v1.14.0 — Correct a saved transfer between pots

**Stable feature release (`v1.14.0`)**, moving **`latest`** and GitHub's **Latest** release. It answers **GitHub issue #33**: a transfer between your own pots could only be reviewed and *voided* — there was no way to add the note you forgot, fix a mistyped amount, or put right a pot picked by mistake, the way a purchase can be edited. The app badge should read **`v1.14.0 · stable`**.

## What changed

### A saved transfer is corrected in place (issue #33)

- Every live row in **Accounts, Pots & Checkpoints → Transfers between pots** now offers **Edit** beside **Void**. The editor opens holding the record exactly as saved — both pots, the amount, the transfer's own date and its note — so a correction is typed over what is there rather than retyped from nothing.
- **What can be changed:** the from-pot, the to-pot, the amount, the date, and the note (add one afterwards, or write over a wrong one). A blank note keeps the note that is there, and a blank date means "unchanged" — the same rules every other record's edit form follows.
- **What cannot:** who entered it and when it was entered. An edit is a correction, never a new movement, so the app's same-day checkpoint rule cannot be rewritten by one — a transfer that a same-day checkpoint already absorbed stays absorbed, and only the *date* moves when the date was wrong.
- **Creating a transfer is unchanged:** still Quick Entry → Move → Between pots. All Transactions stays read-only, and its existing `Open this transfer` link still lands on the row — which is now the place that can fix it.

### A correction keeps the record's history honest

- **Version guard:** the form carries the version of the row the page rendered. If the record changed underneath (another tab, another person), the save is refused with the app's own message — "changed by someone else… nothing was saved" — and nothing is written.
- **Audit:** the correction stores the before and after of the transfer in the audit trail, so "what was it before?" survives any later void.
- **Read-only support view:** a support session cannot correct a transfer, exactly as it cannot correct anything else.
- **Nothing can turn a transfer into spending:** the corrected record is still a transfer, so it stays out of every insight, chart and month comparison by construction.

## Schema and existing data

- **No database migration, no backup-format change, no `.env` change, and no stored preference change.** Every existing record, figure and attachment is untouched; the change is a new correction path over the tables that already existed.

## Who should update and what to do

- **Everyone on the multi-household installation**, and particularly anyone who has ever voided a transfer just to fix a note or an amount:
  1. Take a household backup in **Settings** and a registry backup in **Admin** (`/admin`), and keep a copy of `/mnt/user/appdata/simple-finance-multi-household/.env`.
  2. In Unraid, keep the container Repository on **`ghcr.io/dougalbob/simple-finance-multi-household:latest`** (or pin `:v1.14.0`) and run **Force Update**.
  3. Keep host port **`3009`** → container port **`3000`** and `/mnt/user/appdata/simple-finance-multi-household` → `/data`. Never point this container at `/mnt/user/appdata/simple-finance` or host port `3007`.
  4. Confirm the version badge reads **`v1.14.0 · stable`**. Then check on **Accounts, Pots & Checkpoints**:
     - A transfer row's **Edit** opens with its pots, amount, date and note filled in. Change the amount or a pot, save, and confirm the row shows the corrected movement — one record, not a void plus a second entry.
     - Add a note to a transfer that had none, and confirm the row now carries it.
     - **Void** is still there for a transfer that should never have existed, and a voided row still shows its reason.

## Validation evidence

- `npm run typecheck` (`tsc --noEmit`): clean.
- `npm run format:check` (`prettier --check .`): clean.
- `npm run themes:check`: clean.
- `npm test` (`node scripts/run-tests.mjs`): includes the new boundary cases for the correction schema (`tests/entry-validation.test.ts`) and a domain test in `tests/transfers.test.ts` that corrects pots, amount and date together, proves the entry time is preserved, shows the old pot keeps no phantom leg, and asserts both audit rows.
- Browser (`e2e/transactions.spec.ts`, two new specs): the in-place correction of a wrong pot, a wrong amount and a missing note, and the stale-editor case (a second page loaded before the first saves — the stale save is refused and writes nothing). Both were run **red first** against the unmodified source (no Edit affordance on the row) and green with it, using Chromium per `docs/SANDBOX.md` entry 8; both void their transfer at the end so the shared test seed's pot estimates finish where they started.
- `npm run build` and `npm audit --omit=dev` were run before the release PR; mandatory CI checks (`gates`, `browser`, `docker`) and the tag-triggered `Publish` workflow gate publication.

## Image tags

Stable release: published as `v1.14.0`, `latest` and `sha-<short>`, all to one verified digest. The GitHub release is marked **Latest**.
