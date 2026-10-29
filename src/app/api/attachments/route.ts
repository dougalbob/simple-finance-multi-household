import { revalidatePath } from 'next/cache';
import { householdContextFromHeaders } from '@/lib/auth/household-context';
import { isSameOriginRequest } from '@/lib/auth/origin';
import { loadAppConfig } from '@/lib/config';
import { AttachmentInputError, MAX_ATTACHMENT_BYTES } from '@/lib/records/attachments';
import { uploadAttachmentFromForm } from '@/lib/records/attachment-upload';

/**
 * `POST /api/attachments` — the document upload's own address (v1.44.1).
 *
 * Every form in this app posts back to the page it sits on, so an attachment
 * used to be a `POST /purchases` — the same path the till saves a purchase to.
 * That left a household with no way to tell its firewall "leave document
 * uploads alone": any exception on that path also covers ordinary saves.
 * Cloudflare's OWASP ruleset scores the *body* of a request, and a real PDF
 * accumulates enough signature-looking byte sequences to trip it (a one-page
 * render passes, the four-page bill is blocked), which is precisely a false
 * positive that should be exempted by address rather than by switching a WAF
 * rule off for the whole site.
 *
 * So the browser posts here, to one path, and only this path. The bytes go
 * through exactly the pipeline the server action uses — `storeAttachment`
 * sniffs the content, enforces the 10 MB limit, writes the file, records the
 * row and the audit entry — through the shared `attachment-upload` module, so
 * the route and the no-JavaScript action cannot drift apart.
 *
 * The response is always JSON (`{ status, message }`, the action-state shape),
 * so the form can show the same sentence either way. A refusal from something
 * in front of the app — a firewall, a proxy, Cloudflare itself — cannot produce
 * that shape, and the form says so in words instead of showing an unhandled
 * React error.
 */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'private, no-store' } as const;

/**
 * Multipart framing plus the form's own fields on top of the file. Reading a
 * body far larger than the app's own limit would only waste memory before the
 * pipeline rejected it, so the declared length is checked first and answered
 * with the same 10 MB sentence the pipeline would give.
 */
const MAX_REQUEST_BYTES = Math.ceil(MAX_ATTACHMENT_BYTES * 1.1) + 1024 * 1024;

type UploadState = { status: 'ok' | 'error'; message: string };

function reply(state: UploadState, status: number): Response {
  return Response.json(state, { status, headers: NO_STORE });
}

export async function POST(request: Request): Promise<Response> {
  const config = loadAppConfig();
  let user;
  try {
    user = await householdContextFromHeaders(request.headers, config);
  } catch {
    return reply({ status: 'error', message: 'Household data is unavailable right now.' }, 503);
  }
  if (user === null) {
    return reply({ status: 'error', message: 'Sign in again to attach documents.' }, 401);
  }
  // Same guard as every other mutating route handler: a page on another origin
  // cannot post a file into this household with the household's own cookies.
  if (!isSameOriginRequest(request)) {
    return reply({ status: 'error', message: 'That upload did not come from this app.' }, 403);
  }
  if (user.readOnly) {
    return reply(
      { status: 'error', message: 'A support view is read-only. Nothing can be attached.' },
      403,
    );
  }

  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    return reply(
      { status: 'error', message: 'Attachments must be 10 MB or smaller. This one is too large.' },
      413,
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply({ status: 'error', message: 'Choose a file to attach.' }, 400);
  }

  try {
    const stored = await uploadAttachmentFromForm({
      form,
      db: user.db,
      actor: user.email,
      documentsDir: user.documentsDir,
    });
    revalidateAttachmentPages();
    return reply({ status: 'ok', message: `Attached ${stored.originalName}.` }, 200);
  } catch (err) {
    if (err instanceof AttachmentInputError) {
      return reply({ status: 'error', message: err.message }, 400);
    }
    // Never leak a filesystem path or a stack into the household's browser.
    console.error('attachment upload failed', err);
    return reply(
      {
        status: 'error',
        message: 'That document could not be saved. Nothing was attached — try again.',
      },
      500,
    );
  }
}

/**
 * The same pages the server action revalidates, so the chip appears either way.
 *
 * Cache invalidation is a hint, not part of the save: the row and the file are
 * already committed and the form refreshes the page itself, so a failure here
 * (a route invoked outside a request scope, say) must never turn a stored
 * document into an error the household sees.
 */
function revalidateAttachmentPages(): void {
  try {
    revalidatePath('/purchases');
    revalidatePath('/transactions');
    revalidatePath('/overview');
    revalidatePath('/suppliers');
    revalidatePath('/income');
    revalidatePath('/documents');
  } catch {
    // Nothing was lost; the next request renders the fresh list anyway.
  }
}
