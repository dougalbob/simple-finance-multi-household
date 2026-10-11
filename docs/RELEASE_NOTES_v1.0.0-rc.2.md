# Release notes — v1.0.0-rc.2 — Candidate that never published

> **Never published.** This file exists to complete the chronology; there is no `v1.0.0-rc.2` image and no
> GitHub release for it. Read [`RELEASE_NOTES_v1.0.0.md`](RELEASE_NOTES_v1.0.0.md) for the release that
> shipped.

**What happened.** `v1.0.0-rc.1` had already failed its Publish run, so `rc.2` was cut to carry the workflow
fix. Publish run `38088666376` then failed one step earlier, at *Upgrade smoke test (previously published
releases must migrate cleanly)*. The upgrade smoke chose its base by taking the newest v1+ Git tag other
than the version being released — which was `v1.0.0-rc.1`, a tag whose publish had failed and which therefore
had no image in GHCR. `docker pull` could not find it and the job stopped before building anything new.

Nothing was pushed to GHCR and no GitHub release was created. The Git tag `v1.0.0-rc.2` (commit `b0f7288`)
still exists and must never be used as an upgrade base or installed.

**Why it took a third candidate.** The fix was to treat a tag as an upgrade base only when its image actually
exists in the registry. That fix went into `.github/workflows/publish.yml` for `v1.0.0-rc.3`, which published
successfully. `.github/workflows/ci.yml` had the same selection logic and was not fixed at the time; it was
corrected in the `v1.0.0` release pull request. See `docs/RELEASE_PROCESS.md` §3.

The application code in `rc.2` was identical to `rc.1`; only the publish workflow changed.
