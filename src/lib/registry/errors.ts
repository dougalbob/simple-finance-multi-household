/**
 * Registry (control-plane) errors. Messages are shown verbatim in the
 * administrator UI, so they are plain sentences — no codes, no stack hints.
 */

export class InvalidEmailError extends Error {
  constructor(raw: string) {
    super(`“${raw}” is not a valid email address.`);
    this.name = 'InvalidEmailError';
  }
}

export class InvalidHouseholdIdError extends Error {
  constructor(raw: string) {
    super(`“${raw}” is not a valid household id.`);
    this.name = 'InvalidHouseholdIdError';
  }
}

export class InvalidDisplayNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDisplayNameError';
  }
}

export class HouseholdNotFoundError extends Error {
  constructor(householdId: string) {
    super(`No household with id ${householdId}.`);
    this.name = 'HouseholdNotFoundError';
  }
}

export class HouseholdFullError extends Error {
  constructor() {
    super('This household already has its two sign-in identities. Unassign one first.');
    this.name = 'HouseholdFullError';
  }
}

export class DuplicateIdentityError extends Error {
  constructor(email: string) {
    super(`${email} is already assigned to a household. Unassign it first.`);
    this.name = 'DuplicateIdentityError';
  }
}

export class IdentityNotFoundError extends Error {
  constructor(email: string) {
    super(`No assigned sign-in identity for ${email}.`);
    this.name = 'IdentityNotFoundError';
  }
}

export class LastAdministratorError extends Error {
  constructor() {
    super(
      'This is the only platform administrator. Grant the role to another assigned identity first.',
    );
    this.name = 'LastAdministratorError';
  }
}

/**
 * A support-grant rule was broken (not a member, not an administrator, a
 * second active grant, an unsupported duration, an ended or unknown grant).
 * Messages are plain sentences shown to the household or administrator.
 */
export class SupportGrantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupportGrantError';
  }
}
