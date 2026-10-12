# Release notes — v1.5.0 — Links that look like links, one attach control, and bars that were never drawn

**Release line:** v1.5.x · stable · released 2026-10-12 (Europe/London)

- Image: `ghcr.io/dougalbob/simple-finance-multi-household:v1.5.0`
- Compose: `ghcr.io/dougalbob/simple-finance-multi-household:latest`
- Unraid template: `ghcr.io/dougalbob/simple-finance-multi-household:latest`, host port **3009**
- Platform: linux/amd64

## In this release

- **Every link is blue and underlined** (PR #17, decision 203): links were being found by accident — the
  same weight and nearly the same colour as the sentence around them, with an underline that only appeared
  when the pointer happened to cross them (and never on a phone). They are now the familiar link blue **and
  permanently underlined**, in every one of the 28 themes, light and dark. The household named three places
  specifically — the Schedules card's **Supplier card** link, the "… →" links, and the Horizon day-by-day
  amounts that open the inline transaction list — and all three are converted, along with every other link
  in the app (119 link sites across ~31 files). Links drawn on the till keep the till's own ink, because the
  link blue is a mid-tone and would not read on a dark surface; text that is a button or a toggle keeps its
  underline and does not become blue.
- **One control on "Attach receipt", not two** (PR #17, decision 204): the button no longer sits there
  inviting a press before there is anything to attach. **"Attach receipt" is now the control that opens the
  file picker**, and choosing a file uploads it immediately — while the upload runs it reads
  "Attaching…". This applies to all three places the same form is used: purchases, income records
  ("Attach payslip") and supplier cards ("Attach document"). A browser with JavaScript switched off still
  gets a submit button, served in the HTML and hidden the moment the page is live, so nothing regressed for
  it. Re-choosing the same file after a rejected upload now works too (the input is cleared after each
  attempt).
- **A chart bug, fixed: in-progress bars were not painted on a laptop or desktop** (PR #17, decision 202).
  The hatched "in progress" bars — **Groceries "(so far)"** and the **months chart's running month** — were
  in the page, at the right height, and **completely invisible** on any screen 1024px or wider. Two copies
  of every chart are drawn (a phone figure and a laptop figure, one hidden by CSS), both copies defined the
  same SVG `<pattern>` id, and the browser resolved the fill to the copy inside the hidden figure — which
  paints nothing at all. **Known history, stated plainly:** the Groceries "(so far)" bar was invisible on
  laptop/desktop in **every release from v0.14.0 to v1.4.0**, and the months chart's in-progress month for
  all of **v1.4.0**. Phones were never affected, and no figure on any chart was ever wrong — only unpainted
  on a wide screen. Each drawing now namespaces its own pattern ids, and an in-progress bar is drawn as a
  solid muted bar **with** the hatch over it, so it cannot vanish again even if a paint server fails.
  A new browser test reads the drawing's pixels back and fails if an in-progress bar has no paint in it.
- **Process:** the browser suite gained a PNG-decoding pixel check (`e2e/pixels.ts`, `node:zlib` only — no
  new dependency), and `docs/SANDBOX.md` records that element screenshots come back unpainted in this
  sandbox's headless Chromium (full-page screenshots are the ones that paint).

## Upgrade

From **v1.4.0 or any earlier stable multi-household v1.x** — back up, pull and restart. There is no
schema change or new migration. Before updating, keep a household backup from Settings, the separate
registry backup from `/admin`, and the host's backup of `.env` (neither the registry nor `.env` is in a
household backup).

```bash
docker pull ghcr.io/dougalbob/simple-finance-multi-household:v1.5.0   # version-pinned
docker pull ghcr.io/dougalbob/simple-finance-multi-household:latest  # Compose/Unraid template
```

Keep the existing multi-household data mount: `/mnt/user/appdata/simple-finance-multi-household` →
`/data`, with host port **3009** → container port **3000**. In Unraid, update this container and confirm
**`v1.5.0 · stable`** in the header; the administrator can check the existing identity roster in `/admin`.
**Do not delete `system/` or any household data.** The inherited pre-v1 instructions in older notes are
not a multi-household upgrade path. Original single-household `v0.x` images and their data require a
separately approved import, not this update; leave their port **3007** and
`/mnt/user/appdata/simple-finance` untouched.

No new user-visible secrets or environment variables; see `docs/ENVIRONMENT.md` if you are curious about the
ones the app accepts.

## For the household: what to look at

1. **Links now look like links.** Blue and underlined on every page, in every theme — including the
   **Supplier card** link on `/recurring`, the "… →" links, and the amounts in Horizon's day-by-day table
   (tap one and the transactions behind it open below). If a link is somewhere you would not expect the
   blue, that is a bug worth reporting.
2. **Attaching a receipt is one press.** On `/purchases`, press **Attach receipt** — the file/camera picker
   opens — choose the photo, and it uploads on the spot. There is no second button, and no button that does
   nothing. The same control reads **Attach payslip** on Income and **Attach document** on a supplier card.
3. **The charts are now honest about the period being lived.** On `/charts`, the Groceries "(so far)" bar and
   the months chart's in-progress month are drawn hatched **and** in the muted colour on a laptop or desktop
   — they have been invisible there for a long time, and this release is the first where a wide screen shows
   them. The phone was always right.

## Validation

- `npm test`: **878 tests / 201 suites, all passing** (Node's test runner, including the theme
  re-measurement of the shipped stylesheet and the multi-household isolation contract).
- `npm run format:check`, `npm run typecheck`, `npm run themes:check`, `npm run build` and
  `npm audit --omit=dev` (0 vulnerabilities) all clean in the release session.
- Targeted Playwright checks run locally against this sandbox's Chromium: the `charts` project,
  including the new pixel case; the `attachments` project, including the file-chooser gesture; the
  `income` project, including automatic payslip upload; and permanent link styling on phone and desktop.
  The `charts` pixel case was proved to bite by reverting the fix in a throwaway edit, which made it
  name all four unpainted bars. The full seeded and empty-household suites are required CI gates.
- CI (`gates`, `browser`, `docker` and the container smoke) runs on this pull request against the merged
  tree; the Publish workflow builds, smoke-tests and pushes the image from the `v1.5.0` tag.

## Version badge

Users should see **`v1.5.0 · stable`** in the app header after upgrading.
