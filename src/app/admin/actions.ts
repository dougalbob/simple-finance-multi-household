'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/lib/action-state';
import { appSessionFromRequest } from '@/lib/auth/next';
import { getRegistry } from '@/lib/registry/db';
import {
  assignIdentity,
  createHousehold,
  renameHousehold,
  setHouseholdStatus,
  unassignIdentity,
} from '@/lib/registry/domain';
import { MAX_DISPLAY_NAME_LENGTH } from '@/lib/registry/ids';

/**
 * Platform administration server actions (MULTI_HOUSEHOLD_PLAN §4): create,
 * rename and deactivate households; pre-assign and unassign sign-in
 * identities. Every action re-checks the session on the server — the roster
 * writes are administrator-only, audited in the registry, and never touch any
 * household's financial data.
 *
 * A platform administrator whose own household is deactivated may still reach
 * these actions (they must be able to restore it); everyone else is refused.
 */

const NOT_SIGNED_IN: ActionState = {
  status: 'error',
  message: 'Sign in through your household link first.',
};

const NOT_ADMIN: ActionState = {
  status: 'error',
  message: 'Platform administration is limited to the service administrator.',
};

async function requireAdministrator(): Promise<
  { ok: true; actor: string } | { ok: false; state: ActionState }
> {
  const session = await appSessionFromRequest();
  if (
    session.status === 'not-signed-in' ||
    session.status === 'unassigned' ||
    session.status === 'registry-unavailable'
  ) {
    return { ok: false, state: NOT_SIGNED_IN };
  }
  if (session.user.role !== 'platform_admin') return { ok: false, state: NOT_ADMIN };
  return { ok: true, actor: session.user.email };
}

function domainMessage(error: unknown, fallback: string): ActionState {
  return { status: 'error', message: error instanceof Error ? error.message : fallback };
}

function firstIssue(error: { issues: Array<{ message?: string }> }, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Give the household a short name.')
  .max(
    MAX_DISPLAY_NAME_LENGTH,
    `Household names are at most ${MAX_DISPLAY_NAME_LENGTH} characters.`,
  );

const emailSchema = z
  .string()
  .trim()
  .min(1, 'Enter the sign-in email address to assign.')
  .max(254, 'That address is too long.');
// Shape validation lives in the registry domain (assertAssignableEmail), so a
// malformed address gets one message from one place.

export async function createHouseholdAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAdministrator();
  if (!auth.ok) return auth.state;
  const parsed = displayNameSchema.safeParse(String(formData.get('displayName') ?? ''));
  if (!parsed.success) {
    return { status: 'error', message: firstIssue(parsed.error, 'Check the household name.') };
  }
  try {
    const household = createHousehold(getRegistry(), {
      displayName: parsed.data,
      actor: auth.actor,
    });
    revalidatePath('/admin');
    return {
      status: 'ok',
      message: `Household “${household.displayName}” created. Assign its one or two sign-in emails next.`,
    };
  } catch (error) {
    return domainMessage(error, 'The household could not be created.');
  }
}

export async function renameHouseholdAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAdministrator();
  if (!auth.ok) return auth.state;
  const parsed = z.object({ householdId: z.string(), displayName: displayNameSchema }).safeParse({
    householdId: String(formData.get('householdId') ?? ''),
    displayName: String(formData.get('displayName') ?? ''),
  });
  if (!parsed.success) {
    return { status: 'error', message: firstIssue(parsed.error, 'Check the household name.') };
  }
  try {
    renameHousehold(getRegistry(), { ...parsed.data, actor: auth.actor });
    revalidatePath('/admin');
    return { status: 'ok', message: 'Household name saved.' };
  } catch (error) {
    return domainMessage(error, 'The household could not be renamed.');
  }
}

export async function setHouseholdStatusAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAdministrator();
  if (!auth.ok) return auth.state;
  const parsed = z
    .object({
      householdId: z.string(),
      status: z.enum(['active', 'deactivated']),
    })
    .safeParse({
      householdId: String(formData.get('householdId') ?? ''),
      status: String(formData.get('status') ?? ''),
    });
  if (!parsed.success) {
    return { status: 'error', message: 'Check the household state change.' };
  }
  try {
    const household = setHouseholdStatus(getRegistry(), { ...parsed.data, actor: auth.actor });
    revalidatePath('/admin');
    return {
      status: 'ok',
      message:
        household.status === 'active'
          ? `Household “${household.displayName}” reactivated — its members can sign in again.`
          : `Household “${household.displayName}” deactivated — its members are denied until it is reactivated.`,
    };
  } catch (error) {
    return domainMessage(error, 'The household state could not be changed.');
  }
}

export async function assignIdentityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAdministrator();
  if (!auth.ok) return auth.state;
  const parsed = z.object({ householdId: z.string(), email: emailSchema }).safeParse({
    householdId: String(formData.get('householdId') ?? ''),
    email: String(formData.get('email') ?? ''),
  });
  if (!parsed.success) {
    return { status: 'error', message: firstIssue(parsed.error, 'Check the email address.') };
  }
  try {
    const identity = assignIdentity(getRegistry(), {
      email: parsed.data.email,
      householdId: parsed.data.householdId,
      actor: auth.actor,
    });
    revalidatePath('/admin');
    return {
      status: 'ok',
      message: `${identity.email} can now sign in to this household.`,
    };
  } catch (error) {
    return domainMessage(error, 'The address could not be assigned.');
  }
}

export async function unassignIdentityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await requireAdministrator();
  if (!auth.ok) return auth.state;
  const parsed = emailSchema.safeParse(String(formData.get('email') ?? ''));
  if (!parsed.success) {
    return { status: 'error', message: firstIssue(parsed.error, 'Check the email address.') };
  }
  try {
    unassignIdentity(getRegistry(), { email: parsed.data, actor: auth.actor });
    revalidatePath('/admin');
    return {
      status: 'ok',
      message: `${parsed.data.toLowerCase()} is unassigned and can no longer sign in.`,
    };
  } catch (error) {
    return domainMessage(error, 'The address could not be unassigned.');
  }
}
