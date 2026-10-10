import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { householdSignInEmails, signInEmailChoices } from '../src/lib/auth/sign-in-choices';
import { closeDbHandles, getHouseholdDbHandle } from '../src/lib/db/client';
import { loadAppConfig } from '../src/lib/config';
import { openRegistry, type RegistryDb } from '../src/lib/registry/db';
import { assignIdentity, createHousehold } from '../src/lib/registry/domain';
import { systemRegistryPath } from '../src/lib/registry/paths';
import { createPerson, InvalidPersonEmailError, setPersonEmail } from '../src/lib/records/people';
import { makeTempDir } from './helpers';

/**
 * The identity-to-person link (MULTI_HOUSEHOLD_PLAN §2, decision 146). A person
 * may be linked only to a sign-in the registry assigns to that person's own
 * household. Other households' addresses are never offered or accepted.
 */
describe('person sign-in link is scoped to the household', () => {
  let dataDir: string;
  let registry: RegistryDb;
  let alexId: string;

  before(async () => {
    dataDir = await makeTempDir('sf-identity-link-');
    registry = openRegistry(systemRegistryPath(dataDir));
    const alex = createHousehold(registry, { displayName: 'Alex household', actor: 'system' });
    alexId = alex.id;
    assignIdentity(registry, { email: 'alex@example.com', householdId: alex.id, actor: 'system' });
    assignIdentity(registry, { email: 'sam@example.com', householdId: alex.id, actor: 'system' });
    const lee = createHousehold(registry, { displayName: 'Lee household', actor: 'system' });
    assignIdentity(registry, { email: 'lee@example.com', householdId: lee.id, actor: 'system' });
  });

  after(() => {
    closeDbHandles();
    registry.close();
  });

  it('offers a household only its own registry-assigned sign-ins', () => {
    assert.deepEqual(householdSignInEmails(registry, alexId).sort(), [
      'alex@example.com',
      'sam@example.com',
    ]);
  });

  it('never lists another household’s sign-in in the choices', () => {
    const choices = signInEmailChoices(householdSignInEmails(registry, alexId), []);
    assert.ok(!choices.includes('lee@example.com'));
  });

  it('links a person to an assigned sign-in, and refuses another household’s', () => {
    const handle = getHouseholdDbHandle(
      alexId,
      loadAppConfig({ NODE_ENV: 'test', DATA_DIR: dataDir }),
    );
    try {
      const person = createPerson(handle.db, { label: 'Alex', actor: 'alex@example.com' });
      const allowed = householdSignInEmails(registry, alexId);
      const linked = setPersonEmail(handle.db, {
        id: person.id,
        email: 'Sam@Example.com',
        allowedEmails: allowed,
        actor: 'alex@example.com',
      });
      assert.equal(linked.email, 'sam@example.com');

      assert.throws(
        () =>
          setPersonEmail(handle.db, {
            id: person.id,
            email: 'lee@example.com',
            allowedEmails: allowed,
            actor: 'alex@example.com',
          }),
        InvalidPersonEmailError,
      );
    } finally {
      closeDbHandles();
    }
  });
});
