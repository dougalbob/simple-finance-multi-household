import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { bellSeen } from '../db/schema';

/**
 * Bell seen state (SPEC §26, decision 176): when each person last opened
 * the bell panel. UI state, not a record — not audited, same as the theme
 * cookie. Email is lower-cased, primary key.
 */

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getBellSeenAt(db: Db, email: string): Date | null {
  const normalized = normalizedEmail(email);
  if (normalized === '') return null;
  const row = db.select().from(bellSeen).where(eq(bellSeen.email, normalized)).get();
  if (row === undefined) return null;
  return row.seenAt;
}

export function setBellSeenAt(db: Db, email: string, now: Date = new Date()): void {
  const normalized = normalizedEmail(email);
  if (normalized === '') return;
  db.insert(bellSeen)
    .values({ email: normalized, seenAt: now })
    .onConflictDoUpdate({ target: bellSeen.email, set: { seenAt: now } })
    .run();
}
