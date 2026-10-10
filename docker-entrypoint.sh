#!/bin/sh
# =============================================================================
# Simple Finance container entrypoint:
#   1. source the trusted, admin-owned /data/.env if present,
#   2. prepare the system-registry and household directories under $DATA_DIR,
#   3. align ownership with PUID/PGID and drop privileges (least privilege),
#   4. migrate the registry, then each registered household database,
#   5. exec the server so signals reach Next.js correctly.
#
# /data/.env is a trusted configuration file owned by the administrator
# (0600). Shell-sourcing executes shell code: it must never be writable by
# untrusted users (blueprint §7, docs/SPEC.md §18.1). It is never included in
# household backup archives.
#
# This entrypoint does not create, migrate, mount or chown the inherited
# /data/simple-finance.sqlite or /data/documents paths. Finance data is opened
# only below /data/households/<validated-registry-id>/.
#
# Least privilege: the container starts as root only to align the new appdata
# tree, then execs the server as PUID:PGID (Unraid 99:100 by default). Set
# PUID=0 to keep the historical root behaviour deliberately.
# =============================================================================
set -eu

DATA_DIR="${DATA_DIR:-/data}"

if [ -f "$DATA_DIR/.env" ]; then
  echo "[entrypoint] loading $DATA_DIR/.env"
  set -a
  . "$DATA_DIR/.env"
  set +a
fi

DATA_DIR="${DATA_DIR:-/data}"
PORT="${PORT:-3000}"
PUID="${PUID:-99}"
PGID="${PGID:-100}"
START_COMMAND="node_modules/.bin/next start -H 0.0.0.0 -p $PORT"

mkdir -p "$DATA_DIR/system" "$DATA_DIR/households"

# --- Ownership alignment -----------------------------------------------------
# The server writes as PUID:PGID, so every path it must write has to belong to
# PUID:PGID. The root itself and the two control/data directories are checked
# individually; a mismatch inside a tenant (including its documents directory
# and SQLite WAL/SHM sidecars) triggers a recursive repair of that new-app tree.
# The trusted root-owned /data/.env is deliberately outside recursive chown.
owned_by_app() {
  # True when $1 does not exist (nothing to fix) or is already PUID:PGID.
  [ -e "$1" ] || return 0
  [ "$(stat -c %u "$1")" = "$PUID" ] && [ "$(stat -c %g "$1")" = "$PGID" ]
}

take_ownership() {
  # take_ownership <path> [-R]
  echo "[entrypoint] taking ownership of $1 as $PUID:$PGID"
  chown ${2:-} "$PUID:$PGID" "$1"
}

RUN_AS=""
if [ "$(id -u)" = "0" ]; then
  if [ "$PUID" = "0" ]; then
    echo "[entrypoint] PUID=0 requested - running as root (documented trade-off)"
  else
    for target in "$DATA_DIR" "$DATA_DIR/system" "$DATA_DIR/households"; do
      owned_by_app "$target" || take_ownership "$target"
    done
    # Registry and per-household databases plus their WAL/SHM sidecars. Root-
    # level inherited single-database files are intentionally excluded.
    for dbfile in "$DATA_DIR/system"/*.sqlite* "$DATA_DIR/households"/*/*.sqlite*; do
      [ -e "$dbfile" ] || continue
      owned_by_app "$dbfile" || take_ownership "$dbfile"
    done
    for target in "$DATA_DIR/system" "$DATA_DIR/households"; do
      [ -d "$target" ] || continue
      if command -v find >/dev/null 2>&1; then
        stray="$(
          find "$target" \( ! -user "$PUID" -o ! -group "$PGID" \) -print -quit 2>/dev/null || true
        )"
      else
        stray="unknown (find is unavailable - repairing to be safe)"
      fi
      if [ -n "$stray" ]; then
        echo "[entrypoint] not owned by $PUID:$PGID inside $target: $stray"
        take_ownership "$target" -R
      fi
    done
    if [ -d /app/.next ] && ! owned_by_app /app/.next; then
      # Next.js writes its runtime cache next to the build output.
      take_ownership /app/.next -R
    fi
    RUN_AS="$PUID:$PGID"
  fi
else
  echo "[entrypoint] already running unprivileged as $(id -u):$(id -g)"
fi

echo "[entrypoint] applying registry and household migrations..."
if [ -n "$RUN_AS" ]; then
  if ! gosu "$RUN_AS" node scripts/registry-migrate.cjs; then
    echo "[entrypoint] registry migration failed - refusing to start" >&2
    exit 1
  fi
  if ! gosu "$RUN_AS" node scripts/migrate.cjs; then
    echo "[entrypoint] household database migration failed - refusing to start" >&2
    exit 1
  fi
else
  if ! node scripts/registry-migrate.cjs; then
    echo "[entrypoint] registry migration failed - refusing to start" >&2
    exit 1
  fi
  if ! node scripts/migrate.cjs; then
    echo "[entrypoint] household database migration failed - refusing to start" >&2
    exit 1
  fi
fi

echo "[entrypoint] starting Simple Finance on port ${PORT}${RUN_AS:+ as $RUN_AS}"
if [ -n "$RUN_AS" ]; then
  # gosu execs, so the server becomes PID 1 and receives signals directly.
  exec gosu "$RUN_AS" sh -c "exec $START_COMMAND"
fi
exec sh -c "exec $START_COMMAND"
