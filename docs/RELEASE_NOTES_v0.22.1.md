# Release notes — v0.22.1 (category picker, debt deletion, honest loan status)

**Published:** 2026-09-27. Publish run `36308225732` passed; registry tags verified.
**Merge commit:** `c5e94aa8b2f4078f5fffe4b59deefebf9cd1e7cc` (PR #80; short SHA `c5e94aa`).
**Image tags:** `ghcr.io/dougalbob/simple-finance:v0.22.1` ·
`ghcr.io/dougalbob/simple-finance:latest` · `ghcr.io/dougalbob/simple-finance:sha-c5e94aa`.
**Digest:** `sha256:e8d55169227a3e31fbd4d2c15512f0eb569d451d970e734d0f333288a1efe1de`, shared by all three tags.
This differs from v0.22.0's `sha256:38fa8f57bb372a4af75cbed91a7bbad3f747f5edf4eb03e5d7aa608b072b1a58`;
v0.22.0 still resolves to its original digest (its package version still carries tags `v0.22.0` and
`sha-0cca6ae` only — `latest` has moved to this release).
**Version badge:** `v0.22.1 · pre-release`

## What changed

- **Category rename picker selects the wrong visible category (issue 1, decision 169):** Settings → Category tree → Rename a category: selecting a parent or child made the dropdown display the first parent instead of the chosen category. Option values are `parent:<id>` or `child:<id>` but the controlled select value was only `String(categoryId)`. Fixed by storing `categoryKind` alongside `categoryId`, making the select value `${kind}:${id}`, keeping version in sync when the tree updates (save, then rename again without refresh no longer hits stale version), and adding hydration-ready guard `data-category-ready` + `inert` with `waitForCategoryEditor` for browser tests. Switching operations clears unintended target; add-parent/add-child and child retirement still work; parent retirement remains prohibited.

- **Permanently delete a mistaken debt setup (issue 2, decision 167):** Accounts & Pots → Owed and Owing: household accidentally created **Parents** and cannot remove it. They explicitly prefer full deletion, not voiding or hiding. Implemented permanent deletion for an unused debt setup only when it has no movement records whatsoever, including voided. Enforced server-side in a transaction that guards against a movement being recorded between confirmation and deletion; UI hides button when not eligible but server still refuses. After deletion it disappears from list and any debt selectors, and any expected-support plan attached no longer generates forecast or All Transactions expectation rows. Confirmation clearly identifies counterparty and explains permanence. Existing debt code explicitly said debts are never deleted, so SPEC and decision deliberately updated. Unrelated debts, pot estimates, transactions and outstanding totals remain unchanged. No schema change; deletion is row delete with audit.

- **A loan awaiting its first payment must not say “settled” (issue 3, decision 168):** Reported example Martin & Sue (we owe) settled, no movements yet — bridging pending estate settlement. `debtBalanceLabel` returned `settled` for any zero balance. Now uses honest distinct status: **Awaiting first payment** for `we_owe` with no effective movements, **Awaiting first loan** for `they_owe`. Reserve **Settled** for loan with actual movement history whose outstanding amount is zero; preserve outstanding and overpayment labels. Voided-only history displays unstarted (awaiting) but still blocks deletion per decision 167. No first payment invented, no pot estimate increased. Expected support still appears in projections as expected borrowing where configured, never received income. First borrowing/lending moves status to outstanding; full repayment shows Settled; partial stays outstanding; overpayment distinguishable. Lists/pickers use consistent wording.

- **Test harness only, no change to the app (decision 170):** the browser acceptance suite had an expiry date. Its fictional "Phone plan" standing order was seeded on the 28th of the month, so the newest converted payment was the 28th of the *previous* month — exactly 30 days behind today on the 27th of any month whose predecessor has 31 days. All Transactions shows the last 30 days, so on those days the row `e2e/transactions.spec.ts` asserts on did not exist and the suite went red on a codebase where nothing was wrong. It went red on 2026-09-27, which is why this release was prepared on a second branch: the failure reproduced identically on untouched `main`. Seeded dates a spec asserts on are now relative to today with a guaranteed margin (`scripts/e2e-seed-dates.ts`), the newest Phone plan conversion is always about a week old, and `tests/e2e-seed-dates.test.ts` walks every day of 2025–2028 to prove it — so a future seed edit that reintroduces a date bomb fails `npm test` in milliseconds rather than the browser suite on one particular day of the month. No app code, no schema and no user-visible behaviour is touched by this item.

## Schema and data

No database schema change, no migration. (Decision 170 changes the *fictional* data the browser tests seed; it never touches a real installation's data.) Existing data is used as-is. Debt deletion is a hard delete of a row with zero movements (including voided) — no cascade, no silent history loss; a debt with any movement history cannot be deleted. Debt status wording change is display-only; balance arithmetic unchanged except label now considers effective movement count. Category picker fix is UI-only. v0.22.0 is not retagged and its release notes are untouched.

## Verification

PR #80 passed all three checks — gates, browser and Docker:
[run 36307374068](https://github.com/dougalbob/simple-finance/actions/runs/36307374068),
**88 browser tests passed, 0 failed**. 534 unit tests across 121 suites green, `format:check`,
`tsc --noEmit`, `next build` and `npm audit --omit=dev` clean.
[Publish run 36308225732](https://github.com/dougalbob/simple-finance/actions/runs/36308225732)
built and smoke-tested the image before pushing; registry verification finished green.
The GHCR package-version API groups `v0.22.1`, `latest`, and `sha-c5e94aa` under the single digest above.
The annotated tag stays on the tested merge commit; this notes-only stamp does not amend it.

**One honest caveat about the merge commit's own CI run**
([36307670736](https://github.com/dougalbob/simple-finance/actions/runs/36307670736)): gates and Docker
passed, and the browser job reported **87 passed / 1 failed** — the failure being
`e2e/home.spec.ts:617`, the mobile till's swipe gesture, not anything this release changed. It is a race
in the *test*: `drag()` fires raw touch events at coordinates measured immediately after
`scrollIntoView`, so on a loaded runner the page is still moving, the gesture arrives diagonal and the
till's own rule (≥50px and ≥1.5× more sideways than down) reads it as a scroll, leaving the panel where
it was. Three facts place it outside this release: the identical tree passed 88/88 twenty minutes earlier
on PR #80; the spec passes 6 consecutive local runs of the `mobile` project (23 tests each); and nothing
in decisions 167–170 touches the till's panels. Re-running that job is not permitted for this session's
GitHub token (`403 Resource not accessible by integration`), so the test is hardened in PR #81 instead —
the drag now waits for the scroll to settle before measuring.

## Updating in Unraid

1. **Take a backup:** Settings → Backup, or a consistent appdata backup with the container stopped.
   Keep it safely outside the container.
2. **Force Update** Simple Finance. If pinned to `v0.22.0` or earlier, first switch the repository
   to `ghcr.io/dougalbob/simple-finance:latest` or `ghcr.io/dougalbob/simple-finance:v0.22.1`.
   A pin will not pick up the new image.

The badge should read **v0.22.1 · pre-release**.

[Release notes document](https://github.com/dougalbob/simple-finance/blob/main/docs/RELEASE_NOTES_v0.22.1.md)
