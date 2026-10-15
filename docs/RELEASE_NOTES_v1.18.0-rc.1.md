# Release notes — v1.18.0-rc.1 — Recurring calendar day summaries

**Release candidate 1** for Unraid acceptance testing before a separate stable `v1.18.0`. This is a
pre-release; it does **not** move `latest`. The app badge should read **`v1.18.0-rc.1 · pre-release`**.

## What changed

The Recurring month calendar no longer tries to show every schedule name and amount inside a busy day
cell. Populated days show a compact item count and gross combined amount. Select the summary to open a
details panel with each schedule's name, amount, type and conversion state. Expected receipts are
included in the gross sum, not subtracted from outgoing payments.

Each **Edit schedule** link returns to the Recurring page filtered to that schedule's readable name and
exact schedule ID, with its Edit section already open. The ID constraint prevents similarly named
schedules from appearing as false matches.

## Existing data and migrations

This is a presentation and navigation change only. It reads the same scheduled instances as the existing
calendar and schedule list. No household data is rewritten; no schema migration, backup-format change,
or special migration command is required. The calendar remains a read-only planning aid and does not
change a bank instruction.

## Who should update

This is an **acceptance candidate**, not a stable upgrade announcement. Stable installations can stay on
`latest` (`v1.17.0`) until acceptance and a separate stable release. If you test against existing data,
make a current, restorable backup first. The version badge distinguishes this candidate from stable.

## Unraid and candidate image

1. Back up `/mnt/user/appdata/simple-finance-multi-household`, including `.env`, `system/registry.sqlite`,
   household databases and documents.
2. For this test, pin Repository to **`ghcr.io/dougalbob/simple-finance-multi-household:v1.18.0-rc.1`**.
   Do not use `latest` to test the candidate; the template's stable default remains on `v1.17.0`.
3. Keep bridge networking, host port **3009** → container port **3000**, the existing Cloudflare route,
   and `/mnt/user/appdata/simple-finance-multi-household` → `/data` unchanged. Never point it at or alter
   the original app's `/mnt/user/appdata/simple-finance` directory or port 3007.
4. After updating, check for the **`v1.18.0-rc.1 · pre-release`** badge. On **Recurring**, select a
   populated day's count/amount summary to inspect its individual schedules and try an Edit schedule
   link. Receipts, if present on the same day, are added to the displayed total rather than netted.

The RC publishes only its exact version tag and `sha-<short>`; it does **not** create or move `latest`.
If a change is needed, the next candidate must use a higher RC number. Stable `v1.18.0` follows only
after acceptance.

## Validation evidence

Local gates: formatting, typecheck, theme freshness, all **955 unit tests across 221 suites**, production
build, and production dependency audit (**0 vulnerabilities**). Browser coverage: the full Recurring
project **5/5** and the desktop calendar/edit journey **1/1**; the issue-specific journey checks the
exact total at 320px and 390px, expands all day details, and follows an exact-ID Edit link that opens the
matching disclosure. A separate fictional live-preview smoke confirmed the six-item `£1546.60` example
and all six detail rows.

The release PR must pass the required `gates`, `browser`, and `docker` checks, and the tagged Publish
workflow must succeed before the image is considered available. Local results do not replace those CI
gates.
