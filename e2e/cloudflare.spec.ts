import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Isolated fictional provider state, used only by scripts/e2e-cloudflare.cjs.
const file = path.resolve('.e2e-data/cloudflare-fixture.json');
test('explicit grant/remove refresh inspection, keep feedback and permit deliberate retry', async ({
  page,
}) => {
  // Retry-independent provider state. Never reset or touch the registry seed.
  const original = JSON.parse(fs.readFileSync(file, 'utf8'));
  original.reject = false;
  original.policy.include = [
    { email: { email: 'alex@example.com' } },
    { email: { email: 'cleanup@example.com' } },
  ];
  fs.writeFileSync(file, JSON.stringify(original));
  await page.goto('/admin');
  const panel = page.getByRole('region', { name: 'Cloudflare access', exact: true });
  const target = panel.getByLabel('Email to manage');
  await target.selectOption('sam@example.com');
  await expect(
    panel.getByText('sam@example.com — Registry assigned; No direct email entry', { exact: true }),
  ).toBeVisible();
  await panel.getByLabel(/I confirm nobody/).check();

  // Provider rejection must not be presented as onboarding complete.
  fs.writeFileSync(file, JSON.stringify({ ...original, reject: true }));
  await panel.getByLabel(/I confirm nobody/).check();
  await panel.getByRole('button', { name: 'Grant Cloudflare access', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('write outcome is unknown');
  await expect(
    panel.getByText('sam@example.com — Registry assigned; No direct email entry', { exact: true }),
  ).toBeVisible();
  expect(await page.content()).not.toContain('fictional-e2e-token');

  // Clear the test failure, explicitly retry, and see new inspection without reload.
  fs.writeFileSync(file, JSON.stringify(original));
  await panel.getByLabel(/I confirm nobody/).check();
  await panel.getByRole('button', { name: 'Grant Cloudflare access', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('added and verified');
  await expect(
    panel.getByText('sam@example.com — Registry assigned; Email present in policy', {
      exact: true,
    }),
  ).toBeVisible();
  await panel.getByLabel(/I confirm nobody/).check();
  await panel.getByRole('button', { name: 'Grant Cloudflare access', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('already present');

  await target.selectOption('alex@example.com');
  await expect(
    panel.getByRole('button', { name: 'Remove from Cloudflare', exact: true }),
  ).toBeDisabled();
  await target.selectOption('cleanup@example.com');
  await expect(
    panel.getByRole('button', { name: 'Grant Cloudflare access', exact: true }),
  ).toBeDisabled();
  await panel.getByLabel(/I confirm nobody/).check();
  await panel.getByRole('button', { name: 'Remove from Cloudflare', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Confirm removal');
  await panel.getByLabel(/I confirm removal/).check();
  await panel.getByLabel(/I confirm nobody/).check();
  await panel.getByRole('button', { name: 'Remove from Cloudflare', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('removed and verified');
  // Feedback survives removal of the policy-only row itself.
  await expect(
    panel.getByText('cleanup@example.com — No registry assignment; Email present in policy', {
      exact: true,
    }),
  ).toHaveCount(0);
  await target.selectOption('sam@example.com');
  await panel.getByLabel(/I confirm removal/).check();
  await panel.getByLabel(/I confirm nobody/).check();
  await panel.getByRole('button', { name: 'Remove from Cloudflare', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('removed and verified');
  await expect(
    panel.getByText('sam@example.com — Registry assigned; No direct email entry', { exact: true }),
  ).toBeVisible();
  await panel.getByLabel(/I confirm removal/).check();
  await panel.getByLabel(/I confirm nobody/).check();
  await panel.getByRole('button', { name: 'Remove from Cloudflare', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('already absent');
});
