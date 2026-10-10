import { appSessionFromRequest } from '@/lib/auth/next';

export const dynamic = 'force-dynamic';

/**
 * The one denial surface every guard redirects to (SPEC §3, §19). The message
 * matches the session state so the household knows what to do next: sign in
 * through Cloudflare, or ask the platform administrator to add the sign-in
 * address to a household. An authenticated but unassigned identity is denied
 * here — Cloudflare letting someone reach the hostname is not app access.
 */
export default async function UnauthorizedPage() {
  const session = await appSessionFromRequest();

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      {session.status === 'ok' ? (
        <>
          <h1 className="text-xl font-semibold">Nothing to see here</h1>
          <p className="mt-3 text-sm text-ink-soft">
            You are signed in as {session.user.email} and your household is active — open the app
            from your usual home page.
          </p>
        </>
      ) : session.status === 'unassigned' ? (
        <>
          <h1 className="text-xl font-semibold">No household assigned yet</h1>
          <p className="mt-3 text-sm text-ink-soft">
            You are signed in as {session.email}, but the administrator has not assigned that
            address to a household yet. There is no self sign-up: the administrator adds you first,
            then this page opens the app.
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            Ask the administrator to add {session.email} under Platform administration.
          </p>
        </>
      ) : session.status === 'household-deactivated' ? (
        <>
          <h1 className="text-xl font-semibold">Household deactivated</h1>
          <p className="mt-3 text-sm text-ink-soft">
            This household has been deactivated by the administrator, so its records are not
            reachable right now. Nothing has been deleted.
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            The administrator can reactivate it under Platform administration.
          </p>
        </>
      ) : session.status === 'registry-unavailable' ? (
        <>
          <h1 className="text-xl font-semibold">Service not ready</h1>
          <p className="mt-3 text-sm text-ink-soft">
            The household registry cannot be read right now, so sign-in cannot be confirmed. Try
            again shortly; if it persists, check the installation logs.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold">Not signed in</h1>
          <p className="mt-3 text-sm text-ink-soft">
            Simple Finance is a private application protected by Cloudflare Access. Open it through
            your usual household link so you arrive signed in with your Google identity.
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            If you believe you should have access, ask the other household member to check the
            Access allowlist.
          </p>
        </>
      )}
    </main>
  );
}
