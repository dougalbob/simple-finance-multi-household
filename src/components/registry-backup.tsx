'use client';

export function RegistryBackup() {
  return (
    <section
      aria-labelledby="admin-backup-heading"
      className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
    >
      <h2 id="admin-backup-heading" className="text-lg font-semibold text-ink">
        Registry Database Backup
      </h2>
      <p className="mt-1 text-xs leading-5 text-ink-muted">
        Download the system registry (households and identity assignments), or restore a valid
        SQLite registry backup.
      </p>

      <a
        href="/admin/backup"
        className="mt-4 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-fill-ink shadow-sm hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
      >
        Download Backup
      </a>

      <form
        action="/admin/restore"
        method="POST"
        encType="multipart/form-data"
        className="mt-4 border-t border-border-hairline pt-4"
      >
        <label htmlFor="admin-registry-backup-file" className="text-xs font-medium text-ink-soft">
          Registry backup file
        </label>
        <input
          id="admin-registry-backup-file"
          type="file"
          name="file"
          accept=".sqlite,.db"
          required
          className="mt-2 block w-full min-w-0 text-xs text-ink-muted file:mr-3 file:max-w-full file:rounded-lg file:border-0 file:bg-canvas file:px-3 file:py-2 file:text-xs file:font-medium file:text-accent hover:file:bg-surface-muted"
        />
        <button
          type="submit"
          className="mt-3 inline-flex items-center justify-center rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium shadow-sm hover:bg-canvas focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
          onClick={(event) => {
            if (
              !confirm(
                'Are you sure you want to restore the registry database? This will overwrite the current registry.',
              )
            ) {
              event.preventDefault();
            }
          }}
        >
          Restore
        </button>
      </form>
    </section>
  );
}
