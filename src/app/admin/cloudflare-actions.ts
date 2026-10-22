'use server';

import { revalidatePath } from 'next/cache';
import type { ActionState } from '@/lib/action-state';
import { appSessionFromRequest } from '@/lib/auth/next';
import { isRegistryAdminSession } from '@/lib/auth/current-user';
import { loadAppConfig } from '@/lib/config';
import { getRegistry } from '@/lib/registry/db';
import { mutateCloudflare } from '@/lib/cloudflare/mutate';

/** Standard Next POST/Origin protections remain enabled. All trust is server-side. */
export async function changeCloudflareAccessAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const config = loadAppConfig();
  const session = await appSessionFromRequest();
  const state = await mutateCloudflare(
    {
      operation: form.get('operation'),
      email: form.get('email'),
      exclusiveEdit: form.get('exclusiveEdit') === 'on',
      confirmRemoval: form.get('confirmRemoval') === 'on',
    },
    {
      session,
      config,
      registry: () => getRegistry(config),
    },
  );
  // Including failures/unknown outcomes: do not leave stale inspection on screen.
  if (isRegistryAdminSession(session, config)) revalidatePath('/admin');
  return state;
}
