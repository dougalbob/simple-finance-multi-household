'use client';

import { useActionState, useState } from 'react';
import { saveServerSettingsAction } from '@/app/admin/actions';
import { initialServerSettingsActionState } from '@/lib/action-state';

const inputClass =
  'rounded border border-border-strong bg-surface px-2.5 py-1.5 text-sm focus:border-border-emphasis focus:outline-none';
const labelClass = 'text-xs font-medium text-ink-soft';
const submitClass =
  'rounded bg-till px-3 py-1.5 text-sm font-medium text-till-ink disabled:opacity-60';

export interface AdminSettingsValues {
  issuer: string;
  audience: string;
  certsUrl: string;
  allowedEmails: string;
  cloudflareAccessUrl: string;
}

export interface AdminSettingsProps {
  /** Values as they appear on disk in the env file (after save, before restart). */
  initialValues: AdminSettingsValues;
  /** Absolute path of the env file, shown for orientation only. */
  envPath: string;
  /** False when the env file does not exist yet (a save will create it). */
  fileExists: boolean;
  /** Set when the file exists but could not be read (permissions). */
  readError: string | null;
  /** True when the file on disk differs from the values the running process uses. */
  drift: boolean;
}

function FormMessage({ status, message }: { status: string; message: string | null }) {
  if (message === null) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className={status === 'error' ? 'text-sm text-danger' : 'text-sm text-positive'}
    >
      {message}
    </p>
  );
}

/**
 * Server settings (issue #91): edit the key fields of the trusted env file
 * (`/data/.env`) from the admin page, and keep a one-click shortcut to the
 * Cloudflare Access rule that guards the hostname.
 *
 * Saving writes the file immediately (single-quoted shell literals, atomic,
 * `.bak` copy, registry audit) but the running process keeps its old values
 * until the container restarts — hence the restart banner.
 */
export function AdminSettings({
  initialValues,
  envPath,
  fileExists,
  readError,
  drift,
}: AdminSettingsProps) {
  const [state, formAction, pending] = useActionState(
    saveServerSettingsAction,
    initialServerSettingsActionState,
  );
  const [cloudflareUrl, setCloudflareUrl] = useState(initialValues.cloudflareAccessUrl);

  const showRestartBanner = state.restartRequired || drift;

  return (
    <section aria-labelledby="admin-settings-heading">
      <h2 id="admin-settings-heading" className="sr-only">
        Server settings
      </h2>
      <p className="mb-3 text-xs text-ink-muted">
        The authentication and access keys in the container&apos;s environment file ({envPath})
        {fileExists ? '' : ' — this file does not exist yet; saving creates it'}. Only the
        REGISTRY_ADMIN_EMAIL administrator can change these. Saving writes the file and keeps a{' '}
        <code className="rounded bg-canvas px-1">.bak</code> copy of the previous version; the
        running app keeps its current values until the container is restarted.
      </p>
      {readError !== null ? (
        <p
          role="status"
          className="mb-3 rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger"
        >
          The environment file could not be read: {readError}. Check the file&apos;s ownership and
          permissions (it should belong to the app user, mode 0600) before editing it here.
        </p>
      ) : null}

      {showRestartBanner ? (
        <div
          role="status"
          className="mb-4 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm text-ink"
        >
          <p className="font-medium">Restart the container to apply these settings.</p>
          <p className="mt-1 text-ink-soft">
            The new values are saved in {envPath}, but the running process was started with the old
            ones. In Unraid: Docker → {`{`}this container{`}`} → Restart. Until then the app
            continues to authenticate with the previous values.
          </p>
        </div>
      ) : null}

      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="cfg-auth-issuer" className={labelClass}>
              AUTH_ISSUER (Cloudflare Access team URL)
            </label>
            <input
              id="cfg-auth-issuer"
              name="AUTH_ISSUER"
              type="text"
              required
              placeholder="https://your-team.cloudflareaccess.com"
              defaultValue={initialValues.issuer}
              className={inputClass}
            />
            <p className="text-xs text-ink-muted">The expected JWT issuer.</p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="cfg-auth-audience" className={labelClass}>
              AUTH_AUDIENCE (application AUD tag)
            </label>
            <input
              id="cfg-auth-audience"
              name="AUTH_AUDIENCE"
              type="text"
              required
              placeholder="e.g. 9f3b1c…"
              defaultValue={initialValues.audience}
              className={inputClass}
            />
            <p className="text-xs text-ink-muted">
              The Access application&apos;s AUD tag — rotate here if Cloudflare regenerates it.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="cfg-auth-certs" className={labelClass}>
              AUTH_CERTS_URL (optional)
            </label>
            <input
              id="cfg-auth-certs"
              name="AUTH_CERTS_URL"
              type="text"
              placeholder="Defaults to issuer + /cdn-cgi/access/certs"
              defaultValue={initialValues.certsUrl}
              className={inputClass}
            />
            <p className="text-xs text-ink-muted">Leave blank unless you mirror the JWKS.</p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="cfg-auth-allowed" className={labelClass}>
              AUTH_ALLOWED_EMAILS (optional, comma-separated)
            </label>
            <input
              id="cfg-auth-allowed"
              name="AUTH_ALLOWED_EMAILS"
              type="text"
              placeholder="Leave blank to allow exactly the assigned identities"
              defaultValue={initialValues.allowedEmails}
              className={inputClass}
            />
            <p className="text-xs text-ink-muted">
              Optional extra allowlist. Everyone assigned on this page is allowed automatically —
              this only needs entries that are not on the roster (it will be removed in a later
              release).
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="cfg-cloudflare-url" className={labelClass}>
            CLOUDFLARE_ACCESS_URL (optional)
          </label>
          <div className="flex flex-wrap items-start gap-2">
            <input
              id="cfg-cloudflare-url"
              name="CLOUDFLARE_ACCESS_URL"
              type="text"
              placeholder="https://dash.cloudflare.com/…/access/apps/…"
              value={cloudflareUrl}
              onChange={(e) => setCloudflareUrl(e.target.value)}
              className={`${inputClass} min-w-[16rem] flex-1`}
            />
            {cloudflareUrl !== '' ? (
              <a
                href={cloudflareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded border border-border-strong px-3 py-1.5 text-sm font-medium"
              >
                Open Cloudflare ↗
              </a>
            ) : null}
          </div>
          <p className="text-xs text-ink-muted">
            A bookmark to the Access rule that controls who may sign in. The button opens it in a
            new tab; changing who can sign in still happens in the Cloudflare dashboard.
          </p>
        </div>

        <button type="submit" disabled={pending} className={`${submitClass} self-start`}>
          {pending ? 'Saving…' : 'Save settings'}
        </button>
        <FormMessage status={state.status} message={state.message} />
      </form>
    </section>
  );
}
