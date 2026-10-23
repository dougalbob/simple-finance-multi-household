import { inspectCloudflare } from '@/lib/cloudflare/inspect';
import { CloudflareControls } from './cloudflare-controls';

/** Server component: API credentials never enter client props or HTML. */
export async function CloudflareInspection({
  emails,
  administrator,
}: {
  emails: string[];
  administrator: string;
}) {
  const result = await inspectCloudflare();
  return (
    <section aria-labelledby="cloudflare-heading">
      <h2 id="cloudflare-heading" className="sr-only">
        Cloudflare access
      </h2>
      <p className="my-2 text-sm text-ink-soft">
        Compare direct policy emails with registry assignments. Changes require an explicit
        administrator action below. Reload this page to check again.
      </p>
      {result.status !== 'ok' ? (
        <p role="status" className="text-sm">
          {result.message}
        </p>
      ) : (
        <>
          <p className="text-sm">
            Application: {result.application} · Policy: {result.policy}
          </p>
          <p className="my-2 text-sm">
            {result.complex
              ? 'This policy has additional conditions or non-email rules. Email presence alone does not establish access; absence does not establish denial.'
              : 'These are direct email entries in the selected policy, not a guarantee of effective access through all Cloudflare policies or household status.'}
          </p>
          <ul className="space-y-1 text-sm">
            {[...new Set([...emails, ...result.emails])].sort().map((email) => (
              <li key={email}>
                {email} — {emails.includes(email) ? 'Registry assigned' : 'No registry assignment'};{' '}
                {result.emails.includes(email)
                  ? 'Email present in policy'
                  : 'No direct email entry'}
              </li>
            ))}
          </ul>
        </>
      )}
      <CloudflareControls
        emails={[...new Set([...emails, ...(result.status === 'ok' ? result.emails : [])])].sort()}
        assigned={emails}
        administrator={administrator}
      />
    </section>
  );
}
