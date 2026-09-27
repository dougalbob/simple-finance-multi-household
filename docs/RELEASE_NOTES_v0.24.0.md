# Release notes — v0.24.0 — a saved purchase clears the till

**Version badge after updating:** `v0.24.0 · pre-release`.

## What changed

At the till, saving a purchase now hands the form back **empty**, and the **Save button greys out**
until the next purchase has been filled in. The Fuel tab does the same.

This is the household's own request, asked at the till:

> When I Save a purchase in the quick entry panel I see the "Add another" button, which is desired
> behaviour. What I would like to see however is for the breadcrumbs from the purchase just saved to
> be cleared so that both entry forms (swipe screens 1 & 2) are reset and become blank once more.
> Also, once we have pressed "Save" on the original purchase, can that button be greyed out, as
> logically no save should be possible at that point until the user has completed details of the
> "Add another" new purchase.

**What is cleared when a purchase saves:** supplier, amount, date, the note (and the note field
closes behind "+ Note" again), and the split lines back to one fresh line with the amount-following
restarted. The confirmation line ("Purchase saved: £12.34.") stays on screen, and so does the card
you were on and the keyboard you had open or shut — nothing moves except the values.

**What stays as it is:** the **pot** and **Paid by**. The same pot and the same person usually pay
for the next purchase, so those choices are deliberately kept. The same is true on the Fuel tab,
where the **vehicle** stays too. If you would rather they cleared as well, say so and it is a small
change.

**Why Save greys out by itself:** Save is only ever enabled when the split balances exactly, and a
blank form is not balanced. So the emptying of the form *is* the greying-out — there is no separate
"already saved" mode, and no new button to understand.

**"Add another" is still there, with a narrower job.** It appears next to Save while the form is
blank after a save, and it is the shortcut back to the first card with the supplier focused (so you
can start typing the next one straight away). Once you begin typing the next purchase it steps out
of the way, rather than sitting there as a button that would wipe what you had typed. For a form you
filled in and decided not to save, it remains the start-over button it has always been.

**The accident this removes:** until now, after a save the just-saved values were still in the form
and still balanced, so pressing Save again really did record a second purchase. The app then
apologised with "Possible duplicate — the purchase was saved, not blocked". That duplicate check is
unchanged and still there for a genuine double entry; what has gone is the accidental double-tap.

**A failed save changes nothing.** If the server refuses an entry, every value is kept so it can be
corrected and saved again — only a successful save blanks the form.

## Fuel

The Fuel tab behaves the same way: after a fill saves, the amount, litres, odometer, supplier, date
and note clear, **Save fuel greys out** until the next fill has an amount, and the mpg answer stays on
screen. Pot, vehicle and paid-by stay. The **"Filled to full" tick goes back to off** — a tick left
behind would measure the next fill as a full tank and report a wrong mpg.

Balance checkpoints are deliberately unchanged: they are a different question, and nothing in this
ask was about them.

## Who is affected and what to do

Everyone, on the phone and on the laptop. Nothing to do: take a backup, Force Update, and record
purchases the way you always did. The only habit that changes is that Save is no longer live straight
after a save — which is the point.

If you have a workflow that relied on pressing Save repeatedly to record the same purchase, use
"Add another" (or just start typing the next one; the form is already blank and Save comes back on
its own when the entry is complete).

## Schema and data

**None.** No migration, no schema change, no change to any server action, and no change to the
duplicate detection. This release is a front-end behaviour change in
`src/components/quick-entry.tsx` only. No ledger, pot, schedule, document or setting row is written
or altered by it, and no existing data is read differently.

## Verification

`npm test` (547 tests, 124 suites), `npm run typecheck`, `npm run format:check` and `npm run build`
all pass on the released tree. The full Playwright acceptance suite (92 tests across every project)
passes, including new coverage for: the form blank after a save, Save disabled until the next entry is
complete, the pot and payer surviving, the note field closing again, "Add another" offered while blank
and withdrawn once typing starts, two identical consecutive saves both clearing (the subtle case: the
two success messages are the same string), and the same behaviour on the Fuel tab.

## Updating in Unraid

1. **Take a backup:** Settings → Backup, or stop the container and back up
   `/mnt/user/appdata/simple-finance` consistently. Keep it outside the container.
2. **Force Update** Simple Finance. The template tracks `ghcr.io/dougalbob/simple-finance:latest`;
   if the container is pinned to a version tag, switch it to
   `ghcr.io/dougalbob/simple-finance:v0.24.0` or `:latest` first — a pin will not pick up the new
   image.

After updating, the navigation badge should read **v0.24.0 · pre-release**. No migration runs for
this release, so the first start's log is the usual `[migrate] database is up to date`.

Full detail: [`docs/RELEASE_NOTES_v0.24.0.md`](RELEASE_NOTES_v0.24.0.md) in the repository, and
decision 174 in `docs/IMPLEMENTATION_PLAN.md`.
