import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

interface JournalEntry {
  tag: string;
  when: number;
}

/**
 * The migration journal's `when` stamps are ordering keys, not history.
 * drizzle's better-sqlite3 migrator applies a journal entry only when its
 * stamp is newer than the newest stamp already recorded in the database
 * (`ORDER BY created_at DESC LIMIT 1`), so an entry stamped earlier than an
 * already-applied entry is silently skipped on every upgraded database — while
 * fresh databases, which have no rows yet, apply everything in order and stay
 * green in CI.
 *
 * That is exactly how v0.23.0 shipped broken: 0011 had been hand-stamped with
 * a round future number (1790600000000) and 0012 carried its real generation
 * stamp (1790506141836), so upgrades silently skipped 0012. This guard fails
 * `npm test` in milliseconds if the journal ever goes out of order or carries
 * a future stamp again. See docs/RELEASE_NOTES_v0.23.1.md.
 */
describe('drizzle migration journal ordering', () => {
  const journalPath = path.resolve('drizzle/meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: JournalEntry[];
  };

  it('has entries', () => {
    assert.ok(journal.entries.length > 0);
  });

  it('stamps are strictly increasing in journal order', () => {
    let previous: JournalEntry | undefined;
    for (const current of journal.entries) {
      if (previous !== undefined) {
        assert.ok(
          current.when > previous.when,
          `${current.tag} (when=${current.when}) must be stamped strictly after ` +
            `${previous.tag} (when=${previous.when}) — drizzle's migrator silently skips an ` +
            'out-of-order entry on every upgraded database (v0.23.0 incident)',
        );
      }
      previous = current;
    }
  });

  it('no stamp is in the future', () => {
    const now = Date.now();
    for (const entry of journal.entries) {
      assert.ok(
        entry.when <= now,
        `${entry.tag} (when=${entry.when}) is stamped in the future — a future stamp makes every ` +
          'later real-clock migration sort before it and be skipped on upgrades (v0.23.0 incident)',
      );
    }
  });

  it('every entry has a unique tag and an existing .sql file', () => {
    const tags = new Set<string>();
    for (const entry of journal.entries) {
      assert.ok(!tags.has(entry.tag), `duplicate journal tag ${entry.tag}`);
      tags.add(entry.tag);
      assert.ok(
        existsSync(path.resolve('drizzle', `${entry.tag}.sql`)),
        `journal entry ${entry.tag} has no .sql file`,
      );
    }
  });
});
