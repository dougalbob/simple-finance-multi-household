'use client';

export function RegistryBackup() {
  return (
    <section
      aria-labelledby="admin-backup-heading"
      className="rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <h2 id="admin-backup-heading" className="mb-1 text-lg font-semibold">
        Registry Database Backup
      </h2>
      <p className="mb-4 text-xs text-ink-muted">
        Download a backup of the system registry (households and identity assignments). If restoring
        from a backup, ensure you only restore valid SQLite registry files.
      </p>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex-1">
          <a
            href="/admin/backup"
            className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-fill-ink shadow-sm hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
          >
            Download Backup
          </a>
        </div>

        <div className="flex-1">
          <form
            action="/admin/restore"
            method="POST"
            encType="multipart/form-data"
            className="flex items-center gap-2"
          >
            <input
              type="file"
              name="file"
              accept=".sqlite,.db"
              required
              className="block w-full text-sm text-ink-muted file:mr-4 file:rounded-md file:border-0 file:bg-canvas file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent hover:file:bg-canvas/80"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium shadow-sm hover:bg-canvas focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              onClick={(e) => {
                if (
                  !confirm(
                    'Are you sure you want to restore the registry database? This will overwrite the current registry.',
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              Restore
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
