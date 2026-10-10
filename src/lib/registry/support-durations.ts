/**
 * The only support-access lengths a household can grant (MULTI_HOUSEHOLD_PLAN
 * §4). Kept in a dependency-free module so the client form can offer exactly
 * these choices without importing any server-side registry code.
 */
export const SUPPORT_GRANT_DURATIONS_MINUTES = [60, 240, 1440] as const;
export type SupportGrantDurationMinutes = (typeof SUPPORT_GRANT_DURATIONS_MINUTES)[number];
