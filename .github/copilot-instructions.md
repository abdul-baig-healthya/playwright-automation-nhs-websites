# Copilot Instructions — Playwright Automation: NHS Pharmacy Websites

## Project Overview

This repo automates E2E tests for multiple NHS pharmacy websites built on the **Healthya** platform. Tests run through a custom **Express dashboard** (`dashboard.js`) that streams test output to a web UI (`dashboard-public/index.html`) via Server-Sent Events.

---

## Commands

```bash
# Start the dashboard (port 7890) — primary entry point
node dashboard.js
# or
npm run dashboard

# Run all tests headlessly
npm test

# Run tests in headed mode (requires display / Xvfb)
npm run test:headed

# Run a single test file for a specific pharmacy
npx playwright test tests/e2e/nhs-flows.spec.ts --project="The Pharmacist"

# Run a single test by line number
npx playwright test tests/e2e/condition-flow.spec.ts:145 --project="Paydens"

# Run tests matching a name pattern
npx playwright test --grep "NHS — next available slot" --project="Pharmaease"

# Open Playwright UI (local only — requires display)
npx playwright test --ui

# Codespaces headed mode (Xvfb virtual display + noVNC on port 6080)
bash start-codespaces.sh
```

**Do NOT pass `--video`, `--trace`, or `--headed` as CLI flags.** These are controlled in `playwright.config.ts` (`use: { trace: "on", video: "on" }`) and via the dashboard.

---

## Architecture

### Multi-Pharmacy Project System

- Pharmacy sites are defined in **`tests/fixtures/pharmacies.ts`** (`PHARMACY_SITES` array).
- Each entry automatically becomes a separate **Playwright project** (see `playwright.config.ts`).
- Add/remove pharmacies only in `pharmacies.ts` — no other config changes needed.
- `ciSkip: true` excludes a site from CI runs (e.g., `Localhost`).
- `BASE_URL` environment variable creates a single **"CI Override"** project that overrides all pharmacies.

```typescript
// tests/fixtures/pharmacies.ts
export const PHARMACY_SITES: PharmacySite[] = [
  { name: "Pharmaease", baseURL: "https://pharmaease.healthya.co.uk/" },
  { name: "Paydens", baseURL: "https://paydens-pharmacy.healthya.co.uk/" },
  { name: "The Pharmacist", baseURL: "https://thepharmacist.healthya.co.uk/" },
  { name: "Localhost", baseURL: "http://localhost:4005", ciSkip: true },
];
```

### Test Structure

```
tests/
  e2e/
    condition-flow.spec.ts      # Legacy monolithic spec (one active condition at a time)
    nhs-flows.spec.ts           # NHS flows — iterates over FLOW_CONFIGS
    private-flows.spec.ts       # Private flows — iterates over FLOW_CONFIGS
    conditions-listing.spec.ts  # Smoke test for the conditions listing page
  helpers/
    run-flow.ts                 # Shared runConditionFlow() helper used by nhs/private specs
  fixtures/
    pharmacies.ts               # Pharmacy sites → Playwright projects
    flow-configs.ts             # FLOW_CONFIGS — named test scenarios (condition + booking + payment)
    test-data.ts                # TEST_USER, ACTIVE_CONDITION, booking/cart/shipping preferences
  page-objects/                 # Page Object Model classes — one file per page/section
```

### Dashboard Server (`dashboard.js`)

- Express server on **port 7890**
- Key routes:
  - `GET /api/pharmacies` — returns parsed `PHARMACY_SITES`
  - `GET /api/tests` — returns test names parsed from spec files
  - `GET /api/run-tests` — SSE stream; spawns `npx playwright test` child process
  - `POST /api/stop-test` — kills the entire running process group (SIGKILL)
  - `POST /api/launch-ui` — launches `playwright test --ui` (local only)
  - `GET /trace-viewer/*` — proxies Playwright trace viewer
- The spawned process uses `detached: true` so `process.kill(-proc.pid, "SIGKILL")` kills the full tree (npx → playwright → browser workers).

### Dynamic Journey Loop

All condition flows use a **detect-and-dispatch** loop rather than a fixed step sequence:

```typescript
// tests/helpers/run-flow.ts — detectCurrentStep()
// Inspects the DOM and URL; returns one of:
// "questionnaire_submit" | "sign_up" | "appointment_booking" | "payment" | "success" | "unknown"
```

This handles varied per-pharmacy flows where questionnaire, signup, booking and payment pages appear in different orders or are skipped entirely.

---

## Key Conventions

### Condition Selection (condition-flow.spec.ts)

`ACTIVE_CONDITION.journeyType` in `tests/fixtures/test-data.ts` controls which condition is tested. Only one line should be uncommented at a time:

```typescript
export const ACTIVE_CONDITION = {
  // journeyType: "nhs" as ConditionJourneyType,
  // journeyType: "private" as ConditionJourneyType,
  journeyType: "lifestyle" as ConditionJourneyType,
};
```

For nhs-flows.spec.ts and private-flows.spec.ts, conditions come from `FLOW_CONFIGS` — no manual change needed.

### Flow Configs

`tests/fixtures/flow-configs.ts` defines named scenarios with condition type, booking preferences, and payment method. Each config becomes a named test in `nhs-flows.spec.ts` / `private-flows.spec.ts`.

### Pharmacy Slug Cookie

Before navigating to a condition detail page, tests set a `selected-corporate-id` cookie with the pharmacy slug extracted from the condition href:

```typescript
// Href format: /{pharmacySlug}/conditions/{conditionSlug}
// or: /conditions/{conditionSlug}  (root route — no slug)
await page.context().addCookies([
  { name: "selected-corporate-id", value: pharmacySlug, url: origin },
]);
```

### Environment Variables

| Variable | Purpose |
|---|---|
| `BASE_URL` | Override all pharmacies; creates "CI Override" project |
| `CONDITION_DETAIL_PATH` | Skip conditions listing; go directly to detail page (e.g. `/the-pharmacist/conditions/weight-management`) |
| `CI` | When `true`, pharmacies with `ciSkip: true` are excluded |

### Test Data

All test data is in `tests/fixtures/test-data.ts`:
- `TEST_USER` — John Smith, DOB 01/01/1990, SW1A 1AA, email lloyd.p2@yopmail.com
- NHS PDS lookup is expected to fail (test user is synthetic); tests handle the "no match → private consultation" path.
- `BOOKING_PREFERENCES`, `CART_PREFERENCES`, `SHIPPING_ADDRESS_PREFERENCES`, `THANK_YOU_PREFERENCES` are all centralised here.

### Page Objects

- One class per page/section in `tests/page-objects/`
- All POMs take `page: Page` in the constructor
- Methods are `async` and use Playwright `locator()` with `waitFor`, `isVisible`, `.catch(() => {})` for optional elements
- Never use `page.$()` or `page.$$()` — always use `page.locator()`

### Trace & Video

`playwright.config.ts` sets `trace: "on"` and `video: "on"` globally. Do not pass these as CLI flags.

### Codespaces Headed Preview

The `start-codespaces.sh` script:
1. Installs `xvfb`, `x11vnc`, `noVNC`
2. Starts a virtual display on `:99` (`DISPLAY=:99`)
3. Starts noVNC on port 6080 (live browser preview)
4. Starts `node dashboard.js`

For headed tests inside Codespaces, ensure `DISPLAY=:99` is exported in the environment.

<claude-mem-context>
# claude-mem: Cross-Session Memory

*No context yet. Complete your first session and context will appear here.*

Use claude-mem's MCP search tools for manual memory queries.
</claude-mem-context>
