// Test-runner preload only. Never imported by production code. All Cloudflare
// traffic is intercepted (including unexpected URLs) so tests cannot use a real
// token or mutate a real account. File state is shared by Next worker processes.
const fs = require('node:fs');
const fixture = process.env.E2E_CLOUDFLARE_FILE;
if (!fixture || process.env.CLOUDFLARE_API_TOKEN !== 'fictional-e2e-token') {
  throw new Error('Cloudflare test preload requires its isolated fictional environment');
}
const original = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith('https://api.cloudflare.com/')) return original(input, options);
  const root = 'https://api.cloudflare.com/client/v4/accounts/e2e-account/access';
  const state = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  if (
    url !== `${root}/apps/e2e-app` &&
    url !== `${root}/policies/e2e-policy` &&
    url !== `${root}/apps/e2e-app/policies/e2e-policy`
  ) {
    throw new Error('Unexpected fictional Cloudflare request');
  }
  const method = options?.method ?? (input instanceof Request ? input.method : 'GET');
  if (method === 'PUT') {
    if (state.reject) return Response.json({ success: false }, { status: 403 });
    const body =
      options?.body !== undefined
        ? await new Response(options.body).text()
        : await input.clone().text();
    state.policy = { ...state.policy, ...JSON.parse(body) };
    fs.writeFileSync(fixture, JSON.stringify(state));
  }
  return Response.json({
    success: true,
    result: url.endsWith('/apps/e2e-app') ? state.application : state.policy,
  });
};
