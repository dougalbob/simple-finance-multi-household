import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const repoFile = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('multi-household isolation contract', () => {
  it('hard-pins publishing to the independent GitHub repository and GHCR image', () => {
    const workflow = repoFile('.github/workflows/publish.yml');
    assert.match(workflow, /EXPECTED_REPOSITORY="dougalbob\/simple-finance-multi-household"/);
    assert.match(workflow, /EXPECTED_IMAGE="ghcr\.io\/dougalbob\/simple-finance-multi-household"/);
    assert.match(workflow, /if \[ "\$ACTUAL_REPOSITORY" != "\$EXPECTED_REPOSITORY" \]; then/);
    assert.match(workflow, /Refusing inherited v0\.x tag/);
    assert.ok(workflow.includes("grep -E '^v[1-9][0-9]*\\.'"));
    assert.doesNotMatch(workflow, /IMAGE="ghcr\.io\/\$\{GITHUB_REPOSITORY/);
  });

  it('does not assign latest to release candidates', () => {
    const workflow = repoFile('.github/workflows/publish.yml');
    assert.match(workflow, /if \[ "\$PRERELEASE" = false \]; then[\s\S]*?\$IMAGE:latest[\s\S]*?fi/);
    assert.match(workflow, /--prerelease/);
    assert.match(workflow, /--latest/);
  });

  it('keeps CI upgrade smoke on this product line and excludes inherited v0 tags', () => {
    const workflow = repoFile('.github/workflows/ci.yml');
    assert.match(workflow, /EXPECTED_REPOSITORY="dougalbob\/simple-finance-multi-household"/);
    assert.match(workflow, /IMAGE="ghcr\.io\/dougalbob\/simple-finance-multi-household"/);
    assert.ok(workflow.includes("grep -E '^v[1-9][0-9]*\\.'"));
    assert.match(workflow, /no previously published v1\+ tag found/);
    assert.doesNotMatch(workflow, /IMAGE="ghcr\.io\/\$\{GITHUB_REPOSITORY/);
  });

  it('keeps the Unraid template on the new package, appdata root and host port', () => {
    const template = repoFile('simple-finance-multi-household.xml');
    assert.match(
      template,
      /<Repository>ghcr\.io\/dougalbob\/simple-finance-multi-household:(latest|v\d+\.\d+\.\d+(-rc\.\d+)?)<\/Repository>/,
    );
    assert.match(template, /<HostPort>3009<\/HostPort>/);
    assert.match(template, /<ContainerPort>3000<\/ContainerPort>/);
    assert.match(template, /<Mode>bridge<\/Mode>/);
    assert.match(
      template,
      /<HostDir>\/mnt\/user\/appdata\/simple-finance-multi-household<\/HostDir>/,
    );
    assert.doesNotMatch(
      template,
      /<Repository>ghcr\.io\/dougalbob\/simple-finance:latest<\/Repository>/,
    );
  });

  it('publishes the target household and release rules in the agent entry points', () => {
    const agentRules = repoFile('AGENTS.md');
    const readme = repoFile('README.md');
    const handoff = repoFile('docs/HANDOFF.md');
    const releaseProcess = repoFile('docs/RELEASE_PROCESS.md');
    const activePlan = repoFile('docs/MULTI_HOUSEHOLD_PLAN.md');
    assert.match(activePlan, /one or two people/);
    assert.match(activePlan, /pre-creates a household and assigns each allowed sign-in email/);
    assert.match(activePlan, /An authenticated but unassigned identity is denied/);
    for (const document of [agentRules, readme, handoff, releaseProcess, activePlan]) {
      assert.match(document, /ghcr\.io\/dougalbob\/simple-finance-multi-household/);
      assert.match(document, /v1\.0\.0-rc\.[12]/);
      assert.match(document, /3009/);
      assert.match(document, /simple-finance-multi-household/);
    }
  });
});
