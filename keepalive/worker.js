// Cloudflare Worker — triggers GitHub Actions workflow dispatch on a cron schedule.
// Deploy with: npx wrangler deploy
// Set GITHUB_TOKEN via: npx wrangler secret put GITHUB_TOKEN

export default {
  // Called on every cron trigger
  async scheduled(event, env, ctx) {
    await triggerWorkflow(env);
  },

  // Also callable via HTTP GET for manual testing
  async fetch(request, env, ctx) {
    const result = await triggerWorkflow(env);
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  },
};

async function triggerWorkflow(env) {
  const url =
    "https://api.github.com/repos/hardik-143/playwright-automation-nhs-websites/actions/workflows/keep-codespace-alive.yml/dispatches";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "cf-keepalive-worker",
    },
    body: JSON.stringify({ ref: "main" }),
  });

  const status = response.status;
  console.log(`GitHub dispatch → HTTP ${status}`);
  return { triggered: true, githubStatus: status, time: new Date().toISOString() };
}
