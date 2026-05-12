# Cloudflare Worker — Codespace Keep-Alive

This Cloudflare Worker fires a GitHub Actions `workflow_dispatch` on a cron schedule to keep your GitHub Codespace alive indefinitely.

---

## Why This Exists

GitHub Codespaces auto-shuts down after the idle timeout (default 30 min). GitHub's own scheduled Actions (`cron:`) are delayed 30–60+ minutes on free/public repos — making them useless as a keep-alive. This Worker runs on **Cloudflare's edge** (free tier, no credit card needed) and fires every 10 minutes with exact precision.

---

## Architecture

```
Cloudflare Worker (cron every 10 min)
    └─▶ POST /repos/.../actions/workflows/keep-codespace-alive.yml/dispatches
            └─▶ GitHub Actions workflow runs
                    └─▶ Finds Codespace → restarts if stopped → pings dashboard
```

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Cloudflare account | Free at [cloudflare.com](https://cloudflare.com) — no card needed |
| GitHub PAT (Personal Access Token) | Classic token, scopes: `workflow` + `codespace` |
| Node.js ≥ 18 | For running Wrangler CLI |

---

## Step-by-Step Setup

### Step 1 — Create a GitHub Personal Access Token

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **"Generate new token" → "Generate new token (classic)"**
3. Give it a name, e.g. `codespace-keepalive`
4. Set expiry to **No expiration** (or as long as you need)
5. Check these scopes:
   - ✅ `workflow` — allows triggering Actions
   - ✅ `codespace` — allows managing Codespaces
6. Click **Generate token** and **copy it now** (you won't see it again)

---

### Step 2 — Install Wrangler CLI

```bash
npm install -g wrangler
```

Verify:
```bash
wrangler --version
```

---

### Step 3 — Log in to Cloudflare

```bash
npx wrangler login
```

This opens a browser window. Log in with your Cloudflare account.

---

### Step 4 — Navigate to this folder

```bash
cd keepalive
```

---

### Step 5 — Set the GitHub Token as a Secret

```bash
npx wrangler secret put GITHUB_TOKEN
```

When prompted, **paste your GitHub PAT** from Step 1 and press Enter.

> ⚠️ Never put the token directly in `worker.js` or `wrangler.toml` — it would be committed to git.

---

### Step 6 — Deploy the Worker

```bash
npx wrangler deploy
```

You'll see output like:
```
Deployed playwright-keepalive triggers
  https://playwright-keepalive.<your-subdomain>.workers.dev
  schedule: */10 * * * *
```

---

### Step 7 — Test the Worker Manually

Open the worker URL in a browser, or run:

```bash
curl https://playwright-keepalive.<your-subdomain>.workers.dev
```

Expected response:
```json
{"triggered":true,"githubStatus":204,"time":"2024-..."}
```

- `githubStatus: 204` = GitHub accepted the dispatch ✅
- `githubStatus: 401` = Bad token — re-run Step 5
- `githubStatus: 404` = Repo or workflow file not found — check `worker.js`

---

### Step 8 — Set Codespace Idle Timeout to Maximum

This is **critical** — the Worker buys 10 minutes between pings, but your Codespace must be configured to wait long enough.

1. Go to [github.com/settings/codespaces](https://github.com/settings/codespaces)
2. Under **"Default idle timeout"**, set it to **240 minutes** (maximum)
3. Save

---

### Step 9 — Verify It's Running

After a few minutes, check:
- [github.com/hardik-143/playwright-automation-nhs-websites/actions](https://github.com/hardik-143/playwright-automation-nhs-websites/actions)
- You should see `keep-codespace-alive` workflow runs appearing every ~10 minutes

---

## Adjusting the Cron Schedule

Edit `wrangler.toml`:

```toml
[triggers]
# crons = ["* * * * *"]      # every 1 min (testing only)
crons = ["*/10 * * * *"]     # every 10 min (production)
```

Then redeploy:
```bash
npx wrangler deploy
```

---

## Files

| File | Purpose |
|---|---|
| `worker.js` | The Worker script — calls GitHub `workflow_dispatch` |
| `wrangler.toml` | Cloudflare Worker config (name, cron schedule) |

---

## Re-deploying After Changes

Any time you edit `worker.js` or `wrangler.toml`, redeploy:

```bash
cd keepalive
npx wrangler deploy
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `githubStatus: 401` | Token expired or wrong — re-run `npx wrangler secret put GITHUB_TOKEN` |
| `githubStatus: 404` | Check repo name / workflow file path in `worker.js` |
| `curl: SSL handshake failure` | macOS system curl uses outdated LibreSSL — test via browser instead |
| Worker not firing on schedule | Check [Cloudflare Dashboard → Workers → playwright-keepalive → Triggers](https://dash.cloudflare.com) |
| Codespace still shutting down | Idle timeout not set — repeat Step 8 |
