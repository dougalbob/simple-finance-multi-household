'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/lib/action-state';
import { appSessionFromRequest, householdContextFromRequest } from '@/lib/auth/next';
import { SUPPORT_VIEW_COOKIE, SUPPORT_VIEW_MAX_AGE_SECONDS } from '@/lib/auth/support';
import { loadAppConfig } from '@/lib/config';
import { getRegistry } from '@/lib/registry/db';
import {
  grantSupportAccess,
  recordSupportOpen,
  resolveSupportGrant,
  revokeSupportAccess,
} from '@/lib/registry/support';
import { SupportGrantError } from '@/lib/registry/errors';
import { formatInstantLocal } from '@/lib/time';

/**
 * Support consent and the read-only support view (MULTI_HOUSEHOLD_PLAN §4).
 *
 * - grant / revoke: a household MEMBER decides. Only the household's own
 *   verified identity may act, and the registry re-checks membership.
 * - open / leave: the platform ADMINISTRATOR selects a live grant. The browser
 *   sends a grant ID; the server validates it against the verified sign-in and
 *   the registry before setting the cookie, and again on every request.
 */

const NOT_SIGNED_IN: ActionState = {
  status: 'error',
  message: 'Sign in through your household link first.',
};

const READ_ONLY_VIEW: ActionState = {
  status: 'error',
  message: 'This is a read-only support view. Support access cannot be changed from here.',
};

const NOT_ADMIN: ActionState = {
  status: 'error',
  message: 'Support views are limited to the service administrator.',
};

function domainMessage(error: unknown): ActionState {
  if (error instanceof SupportGrantError) return { status: 'error', message: error.message };
  return { status: 'error', message: 'Support access could not be changed. Please try again.' };
}

const grantSchema = z.object({
  supportEmail: z
    .string()
    .trim()
    .min(1, 'Choose the administrator to give access to.')
    .max(254, 'That address is too long.'),
  durationMinutes: z.coerce
    .number({ message: 'Choose how long the access lasts.' })
    .int('Choose how long the access lasts.'),
});

export async function grantSupportAccessAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await householdContextFromRequest();
  if (user === null) return NOT_SIGNED_IN;
  if (user.readOnly) return READ_ONLY_VIEW;

  const parsed = grantSchema.safeParse({
    supportEmail: String(formData.get('supportEmail') ?? ''),
    durationMinutes: formData.get('durationMinutes'),
  });
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check the choices.' };
  }
  try {
    const grant = grantSupportAccess(getRegistry(), {
      householdId: user.householdId,
      grantorEmail: user.email,
      supportEmail: parsed.data.supportEmail,
      durationMinutes: parsed.data.durationMinutes,
    });
    revalidatePath('/settings');
    return {
      status: 'ok',
      message: `${grant.supportEmail} can now view this household read-only until ${formatInstantLocal(
        new Date(grant.expiresAt),
      )}. You can end it at any time.`,
    };
  } catch (error) {
    return domainMessage(error);
  }
}

export async function revokeSupportAccessAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await householdContextFromRequest();
  if (user === null) return NOT_SIGNED_IN;
  if (user.readOnly) return READ_ONLY_VIEW;

  const grantId = Number(formData.get('grantId'));
  if (!Number.isSafeInteger(grantId) || grantId <= 0) {
    return { status: 'error', message: 'That support access could not be found.' };
  }
  try {
    const grant = revokeSupportAccess(getRegistry(), { grantId, actorEmail: user.email });
    revalidatePath('/settings');
    return {
      status: 'ok',
      message: `Support access for ${grant.supportEmail} has ended. It stops working immediately.`,
    };
  } catch (error) {
    return domainMessage(error);
  }
}

/** Set the support cookie for a live grant and enter the read-only view. */
export async function openSupportViewAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await appSessionFromRequest();
  if (session.status !== 'ok' && session.status !== 'household-deactivated') {
    return NOT_SIGNED_IN;
  }
  if (session.user.role !== 'platform_admin') return NOT_ADMIN;

  const grantId = Number(formData.get('grantId'));
  if (!Number.isSafeInteger(grantId) || grantId <= 0) {
    return { status: 'error', message: 'That support access could not be found.' };
  }
  const now = new Date();
  const registry = getRegistry();
  const resolved = resolveSupportGrant(registry, {
    grantId,
    supportEmail: session.user.email,
    now,
  });
  if (resolved === null) {
    return {
      status: 'error',
      message: 'That support access is no longer active. Ask the household to grant it again.',
    };
  }
  recordSupportOpen(registry, { grantId, actorEmail: session.user.email, now });

  const remaining = Math.floor((Date.parse(resolved.grant.expiresAt) - now.getTime()) / 1000);
  const jar = await cookies();
  jar.set(SUPPORT_VIEW_COOKIE, String(grantId), {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: loadAppConfig().isProduction,
    maxAge: Math.max(1, Math.min(remaining, SUPPORT_VIEW_MAX_AGE_SECONDS)),
  });
  redirect('/');
}

/** Leave the support view: clears the selection; the administrator's own household returns. */
export async function leaveSupportViewAction(): Promise<void> {
  const jar = await cookies();
  jar.set(SUPPORT_VIEW_COOKIE, '', {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: loadAppConfig().isProduction,
    maxAge: 0,
  });
  redirect('/support');
}
