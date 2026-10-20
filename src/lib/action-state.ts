export interface ActionState {
  status: 'idle' | 'ok' | 'error';
  message: string | null;
}

export interface DuplicateNoticeState {
  purchaseId: number;
  version: number;
  enteredBy: string;
  totalPence: number;
  minutesAgo: number;
}

export interface PurchaseActionState extends ActionState {
  duplicateNotice: DuplicateNoticeState | null;
}

/**
 * Server settings (env file) form state (issue #91). `restartRequired` drives
 * the restart banner: the entrypoint sources /data/.env at container start, so
 * a saved change is on disk immediately but only reaches the running process
 * after a restart.
 */
export interface ServerSettingsActionState extends ActionState {
  restartRequired: boolean;
}

export const initialActionState: ActionState = { status: 'idle', message: null };

export const initialPurchaseActionState: PurchaseActionState = {
  status: 'idle',
  message: null,
  duplicateNotice: null,
};

export const initialServerSettingsActionState: ServerSettingsActionState = {
  status: 'idle',
  message: null,
  restartRequired: false,
};
