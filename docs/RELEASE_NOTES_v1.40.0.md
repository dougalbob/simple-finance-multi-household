# Release notes — v1.40.0 — A compact, task-oriented Admin workspace

**Stable feature release**, moving `latest` and GitHub's Latest release. The badge reads
**`v1.40.0 · stable`**. Answers GitHub issue #107 ("Admin page improvements") with the layout
reviewed and refined in the Arena preview, for full household testing on Unraid.

## What changed

- **A shorter laptop and large-tablet layout.** `/admin` now uses compact summary metrics and a
  two-column workspace at wider widths. Households and recent registry activity remain the main
  working column; creating a household, support access, connection information and advanced tools
  sit in a narrower task rail. Small screens return to one readable column.
- **Households start collapsed.** Each row initially shows only the household name and an expand
  arrow. Expanding it reveals status, metadata and assigned email addresses with their unassign
  controls. A separate **Manage household** disclosure contains assignment, rename and
  activate/deactivate controls, so reading a household does not expose every editing form at once.
- **Bounded lists with earlier entries still reachable.** The household roster and recent registry
  activity scroll inside their cards instead of making the whole page grow without limit. Activity
  retrieves up to **25** roster and access changes, newest first, and explains that scrolling the
  list reaches the earlier entries in that set. Household financial audit entries remain in their
  own household data.
- **Advanced tools are progressive disclosures.** Cloudflare access and Server settings stay out of
  the way until requested. Connection history details remain collapsible, and registry
  backup/restore is arranged vertically in the compact task rail. Existing permissions, warnings,
  confirmations and recovery wording are preserved.
- **Accessible native controls.** Household and advanced sections use native `details`/`summary`
  disclosures with visible keyboard focus. The activity list is keyboard-focusable for scrolling.
  This is a presentation and interaction redesign; the underlying administration operations are the
  same.

## Data and upgrade notes

There is **no schema, migration, authentication, assignment, household-status, storage-path or
backup-format change**. Existing installations need no data repair or manual migration step. The
release changes the Admin interface and its browser tests only.

## Validation evidence

- `npm test`: **1,218/1,218 tests across 274 suites**; typecheck, Prettier, theme and production
  build checks pass.
- The focused Admin and Cloudflare browser run passes **7/7** tests, including initially collapsed
  households, independent expansion and management disclosures, assignment/status workflows and
  the bounded activity list.
- A real Chromium check with five households and 25 activity entries confirmed that all households
  start collapsed and the activity list scrolls to its final entry. Checks at 1,440 px, 1,024 px and
  390 px found no horizontal page overflow.
- The required PR checks remain `gates`, `browser` and `docker`, followed by main CI and the tagged
  Publish workflow. Publication is not complete until those checks and the stable image/release
  verification pass.

## Unraid update

1. Back up first: download each household's backup and take the Admin registry backup.
2. Update only `ghcr.io/dougalbob/simple-finance-multi-household` to **`:v1.40.0`** (or **`:latest`**
   after publication). Confirm the app badge reads **`v1.40.0 · stable`**.
3. Keep appdata **`/mnt/user/appdata/simple-finance-multi-household`** mounted at **`/data`**, and
   host port **3009** mapped to container port **3000**. Do not switch to the original
   single-household image, appdata or port **3007**.
4. Open **Admin** and confirm that each household initially shows only its name and arrow. Expand a
   household to check its assigned emails, then open **Manage household** to reach its editing
   controls. Add enough activity to check the internal list scrolling, and open Cloudflare access or
   Server settings only when needed.
