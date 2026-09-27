# Release notes — v0.22.1 (category picker, debt deletion, honest loan status)

**Published:** _to be filled after Publish green_. Publish run _TBD_ — _to be filled_.
**Merge commit:** _TBD_ (PR _TBD_; short SHA _TBD_).
**Image tags:** `ghcr.io/dougalbob/simple-finance:v0.22.1` ·
`ghcr.io/dougalbob/simple-finance:latest` · `ghcr.io/dougalbob/simple-finance:sha-<TBD>`.
**Digest:** `sha256:<TBD>`, shared by all three tags.
This differs from v0.22.0's `sha256:38fa8f57bb372a4af75cbed91a7bbad3f747f5edf4eb03e5d7aa608b072b1a58`;
v0.22.0 still resolves to its original digest.
**Version badge:** `v0.22.1 · pre-release`

## What changed

- **Category rename picker selects the wrong visible category (issue 1, decision 169):** Settings → Category tree → Rename a category: selecting a parent or child made the dropdown display the first parent instead of the chosen category. Option values are `parent:<id>` or `child:<id>` but the controlled select value was only `String(categoryId)`. Fixed by storing `categoryKind` alongside `categoryId`, making the select value `${kind}:${id}`, keeping version in sync when the tree updates (save, then rename again without refresh no longer hits stale version), and adding hydration-ready guard `data-category-ready` + `inert` with `waitForCategoryEditor` for browser tests. Switching operations clears unintended target; add-parent/add-child and child retirement still work; parent retirement remains prohibited.

- **Permanently delete a mistaken debt setup (issue 2, decision 167):** Accounts & Pots → Owed and Owing: household accidentally created **Parents** and cannot remove it. They explicitly prefer full deletion, not voiding or hiding. Implemented permanent deletion for an unused debt setup only when it has no movement records whatsoever, including voided. Enforced server-side in a transaction that guards against a movement being recorded between confirmation and deletion; UI hides button when not eligible but server still refuses. After deletion it disappears from list and any debt selectors, and any expected-support plan attached no longer generates forecast or All Transactions expectation rows. Confirmation clearly identifies counterparty and explains permanence. Existing debt code explicitly said debts are never deleted, so SPEC and decision deliberately updated. Unrelated debts, pot estimates, transactions and outstanding totals remain unchanged. No schema change; deletion is row delete with audit.

- **A loan awaiting its first payment must not say “settled” (issue 3, decision 168):** Reported example Martin & Sue (we owe) settled, no movements yet — bridging pending estate settlement. `debtBalanceLabel` returned `settled` for any zero balance. Now uses honest distinct status: **Awaiting first payment** for `we_owe` with no effective movements, **Awaiting first loan** for `they_owe`. Reserve **Settled** for loan with actual movement history whose outstanding amount is zero; preserve outstanding and overpayment labels. Voided-only history displays unstarted (awaiting) but still blocks deletion per decision 167. No first payment invented, no pot estimate increased. Expected support still appears in projections as expected borrowing where configured, never received income. First borrowing/lending moves status to outstanding; full repayment shows Settled; partial stays outstanding; overpayment distinguishable. Lists/pickers use consistent wording.

- **Test harness only, no change to the app (decision 170):** the browser acceptance suite had an expiry date. Its fictional "Phone plan" standing order was seeded on the 28th of the month, so the newest converted payment was the 28th of the *previous* month — exactly 30 days behind today on the 27th of any month whose predecessor has 31 days. All Transactions shows the last 30 days, so on those days the row `e2e/transactions.spec.ts` asserts on did not exist and the suite went red on a codebase where nothing was wrong. It went red on 2026-09-27, which is why this release was prepared on a second branch: the failure reproduced identically on untouched `main`. Seeded dates a spec asserts on are now relative to today with a guaranteed margin (`scripts/e2e-seed-dates.ts`), the newest Phone plan conversion is always about a week old, and `tests/e2e-seed-dates.test.ts` walks every day of 2025–2028 to prove it — so a future seed edit that reintroduces a date bomb fails `npm test` in milliseconds rather than the browser suite on one particular day of the month. No app code, no schema and no user-visible behaviour is touched by this item.

## Schema and data

No database schema change, no migration. (Decision 170 changes the *fictional* data the browser tests seed; it never touches a real installation's data.) Existing data is used as-is. Debt deletion is a hard delete of a row with zero movements (including voided) — no cascade, no silent history loss; a debt with any movement history cannot be deleted. Debt status wording change is display-only; balance arithmetic unchanged except label now considers effective movement count. Category picker fix is UI-only. v0.22.0 is not retagged and its release notes are untouched.

## Verification

PR _TBD_ and the exact main merge commit passed gates, browser and Docker checks.
All _TBD_ unit tests and _TBD_ browser tests passed. Main CI: _TBD_.
Publish run _TBD_ built and smoke-tested the image before pushing; registry verification finished green.
The GHCR package-version API groups `v0.22.1`, `latest`, and `sha-<TBD>` under the single digest above.
The annotated tag stays on the tested merge commit; this notes-only stamp does not amend it.

## Updating in Unraid

1. **Take a backup:** Settings → Backup, or a consistent appdata backup with the container stopped.
   Keep it safely outside the container.
2. **Force Update** Simple Finance. If pinned to `v0.22.0` or earlier, first switch the repository
   to `ghcr.io/dougalbob/simple-finance:latest` or `ghcr.io/dougalbob/simple-finance:v0.22.1`.
   A pin will not pick up the new image.

The badge should read **v0.22.1 · pre-release**.

[Release notes document](https://github.com/dougalbob/simple-finance/blob/main/docs/RELEASE_NOTES_v0.22.1.md)
