# Release notes — v0.25.0 — tasks: follow-ups that stay until they are done

**Version badge after updating:** `v0.25.0 · pre-release`.

## What changed

**A follow-up now stays on the list until one of you ticks it.** Until this release, the follow-up
date typed under a supplier call did nothing useful. It showed in "Promised follow-ups" and on
Contracts & Renewals only until the day it fell due, then dropped off both. Say you promised to
chase EnergyCo by 1 November: on 2 November the promise simply vanished. The supplier card kept
printing a bare "Follow up 2026-11-01", and there was no way to mark it done or move it.

Follow-ups are now **tasks**. A task is something one of you has said you will do: "Follow up with
EnergyCo", "Chase the refund", "Research cheaper tariffs". It has an optional due date, it says what
it is about, and it stays listed until someone ticks it. An overdue task goes to the top, not off the
page.

### The Tasks page (new, in the navigation)

**Tasks** is in the laptop's top bar and under **More** in the phone menu. It has two parts, kept
visibly apart:

- **Your tasks** have a checkbox each and are grouped **Overdue**, **Due today**, **Coming up** and
  **No due date**. Each row says what it is about ("About: BroadbandCo") and links straight there.
  Tick the box when it's done. "Reschedule, edit or close with a note" moves the date, rewords the
  task, or closes it with a note ("Switched tariff — no longer needed"). **Done in the last 30 days**
  shows who closed each one, and **Reopen** undoes a mis-tick. Add a task at the top of the page,
  about the household, a supplier or a vehicle.
- **The app has noticed** lists things the app can see need a look, without anyone writing them
  down: renewals, contract ends and card dates inside their warning window; recent fuel fills
  missing their litres or mileage; and a car whose recent fills have no full tank marked, so no mpg
  can be worked out. These have **no checkbox**, only a link. Each one goes away when the thing
  itself is dealt with, such as the renewal reviewed or the litres added.

Every state is written in words: "Overdue by 3 days · was due Thu 24 Sept", "Due today", "In 12
days", "No due date". The colour behind it only repeats what the words already say.

### On a supplier card

- **Tasks** comes before the interaction log. It lists the supplier's open tasks with their boxes,
  "Add a task for …", and the recently closed ones with Reopen. The card's header shows "2 open tasks
  · 1 overdue" even when the card is folded.
- **Logging a call:** under "Promised to follow up? It becomes a task you can tick off." there is a
  **Follow up by** date. There is also an optional box for the words ("Ring back about the fixed
  deal"). Leave it empty and the task is called "Follow up with <supplier>". The call and its task
  are saved together, or not at all.
- **The interaction log is labelled line by line:** "Interaction: Sun 27 Sept · Phone call",
  "Outcome: …", "Logged by: Alex", "Follow up by: Sat 3 Oct — In 6 days" (or "— Done …" once
  ticked). Dates are in words, and the year is added when it isn't this year. "Logged by" shows the
  person's name when their sign-in email is linked in Settings.
- **Documents (new):** attach letters, policy documents and terms to the supplier itself, not only
  to a purchase. PDF, JPEG or PNG, up to 10 MB each, private, in the backup, and removable, the same
  as receipts. Plain text files are not accepted; a policy number belongs in a reference pair.

The Suppliers page's **Promised follow-ups** banner and the **Follow-ups you promised** list on
Contracts & Renewals now show every open task about a supplier, overdue ones first. Each names and
links its supplier's card.

### On a purchase

Each row on **Purchases** has **Add a task**, for things like "Chase the refund" or "Return the
faulty kettle". The purchase's open tasks show on its row with their boxes. On the Tasks page they
read "About: £84.20 at EnergyCo on Tue 1 Sept" and link back to the row. If the purchase is voided
later, its tasks stay listed and can still be closed.

### What is deliberately not here

- **No bell and no count in the header.** You asked for the task model, not the bell.
- **No emails, push or browser notifications.** Tasks live in the app, like every other reminder.
- **No repeating tasks.** Renewals already repeat every year, and contract ends and card dates
  already raise their own key-date alerts.
- **Nothing moves money.** A task changes no balance, estimate or projection.
- **Refund "case" tracking** (reported → refund promised → refunded) is a later decision. If you want
  it, it would grow from tasks.

**One question for you:** should "The app has noticed" also point out a **pot with no balance
checkpoint for a while**? If so, after **7 days** (prompts early, about one and a half of your
checkpoint cycles) or **14 days** (quieter; only a pot that has clearly been forgotten)? It is
not included until you choose.

## Your existing follow-up

Any follow-up date already recorded under a supplier call has been turned into an open task. It is
called "Follow up with <supplier>", it is due on that date, it carries the call's summary as its
detail, and it is linked to the call. If its date has already passed, it now shows as **overdue**
at the top of Tasks. Tick it if it's done. The call itself is unchanged in the log.

## Schema and data

**One migration, `0013_tasks_and_supplier_documents`, runs automatically on the first start.**

- It creates the `tasks` table.
- It copies every recorded follow-up date into a task, as above, with a history entry for each. A
  follow-up that was not a real date becomes a task with no due date rather than being lost.
- It then **removes the old follow-up date column** from the interaction log. The date now lives
  on the task.
- It rebuilds the attachments table so that a document can belong to a supplier. Every existing
  receipt and payslip is kept exactly as it was, with the same ids and files.

Tasks are never deleted. Every create, edit, completion and reopen is in the history, with who did
it and when.

**Going back to v0.24.0 after updating is not supported.** The old version expects the follow-up
column this release removes. If you ever need to go back, restore the backup you take before
updating, which is one more reason to take it. A backup from an older version restored into
v0.25.0 is brought up to date automatically, as always.

## Who is affected and what to do

Everyone. Take a backup, then Force Update. Afterwards:

- Open **Tasks** and check that your existing follow-up is there. If it's done, tick it.
- When you next log a call with a supplier who promised something, use **Follow up by**.

## Verification

`npm test` (568 tests, 132 suites), `npm run typecheck`, `npm run format:check` and `npm run build`
all pass on the released tree. There is new coverage for:

- the words for each due state and the overdue → today → later → undated order;
- completing, and refusing a second tick;
- refusing a stale change when someone else got there first;
- reopening, and editing rules;
- a task about a purchase that is then voided;
- the call and its follow-up saving together, including a forced failure that saves neither;
- the "app has noticed" items;
- upgrading a database shaped like v0.24.0 through the production migration runner, with one
  follow-up migrated, the column dropped, attachments kept, a clean integrity check, and a second
  start changing nothing;
- supplier documents: stored, listed, audited, removed, plain text refused, one owner only.

The full Playwright suite (95 tests across every project) passes. A new `tasks` project covers:

- writing a task, ticking it, finding it still closed after a reload, reopening it, then closing it
  with a note;
- a follow-up promised on a supplier call appearing on the card with labelled log lines and a
  header count, and ticking it there;
- a purchase task linking from Tasks back to its row.

## Updating in Unraid

1. **Take a backup:** Settings → Backup, or stop the container and back up
   `/mnt/user/appdata/simple-finance` consistently. Keep it outside the container.
2. **Force Update** Simple Finance. The template tracks `ghcr.io/dougalbob/simple-finance:latest`.
   If the container is pinned to a version tag, switch it to
   `ghcr.io/dougalbob/simple-finance:v0.25.0` or `:latest` first, because a pin will not pick up
   the new image.

After updating, the navigation badge should read **v0.25.0 · pre-release**, and **Tasks** should be
in the navigation. Migration 0013 runs on the first start. The log line is the usual
`[migrate] database is up to date`, printed after the migration has been applied.

Full detail: [`docs/RELEASE_NOTES_v0.25.0.md`](RELEASE_NOTES_v0.25.0.md) in the repository,
decision 175 in `docs/IMPLEMENTATION_PLAN.md`, and SPEC §25.
