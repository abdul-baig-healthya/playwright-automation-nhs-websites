import { test, expect } from "@playwright/test";
import { TEST_USER } from "../fixtures/test-data";
import { BOOKING_SCENARIOS } from "../fixtures/booking-scenarios";
import { runConditionFlow } from "../helpers/run-flow";
import { ConditionsPage } from "../page-objects/ConditionsPage";
import type { FlowConfig } from "../fixtures/flow-configs";

/** Derive a human-readable name from a condition href slug. */
function nameFromHref(href: string): string {
  const parts = href.replace(/^\//, "").split("/").filter(Boolean);
  const slug = parts[parts.length - 1] ?? href;
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildFlowConfig(
  scenarioId: string,
  scenarioLabel: string,
  scenario: (typeof BOOKING_SCENARIOS)[number],
  href: string,
): FlowConfig {
  return {
    name: `Booking ${scenarioId} — ${scenarioLabel}`,
    conditionJourneyType: "nhs",
    conditionName: nameFromHref(href),
    conditionHref: href,
    booking: scenario.booking,
    paymentMethod: scenario.paymentMethod,
  };
}

/**
 * True when the failure means the chosen condition can't satisfy this booking
 * scenario — so we should retry with the next condition.
 */
function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /not found on \/conditions/i.test(msg) ||
    /Condition detail page did not reach a ready state/i.test(msg) ||
    /Appointment type .* not available/i.test(msg) ||
    /Select next available slot.*not found/i.test(msg) ||
    /No available slots found via random strategy/i.test(msg) ||
    /No available time slots found/i.test(msg) ||
    /not found after .* attempts/i.test(msg) ||
    /Date .* not found/i.test(msg) ||
    /Flow reached a dead-end/i.test(msg)
  );
}

test.describe("Booking Appointment Flows", () => {
  for (const scenario of BOOKING_SCENARIOS) {
    test(`${scenario.id}: ${scenario.label}`, async ({ page, baseURL }) => {
      page.on("pageerror", (err) =>
        console.log(`[page error] ${err.message}`),
      );
      page.on("response", (res) => {
        if (res.status() >= 400) {
          console.log(`[HTTP ${res.status()}] ${res.url()}`);
        }
      });

      // ─── Step 1: Scrape all conditions from /conditions page ─────────────
      const conditionsPage = new ConditionsPage(page);
      let hrefs: string[] = [];

      await test.step("Collect conditions from /conditions page", async () => {
        await conditionsPage.goto();
        await conditionsPage.waitForConditions();
        hrefs = await conditionsPage.getAllAdultConditionHrefs();
        console.log(`📋 Found ${hrefs.length} adult condition(s) on /conditions`);
      });

      expect(hrefs.length, "must have at least one condition on /conditions").toBeGreaterThan(0);

      // ─── Step 2: Try each condition until scenario succeeds ──────────────
      const attempts: { href: string; error: string }[] = [];
      let succeeded = false;

      for (let i = 0; i < hrefs.length; i++) {
        const href = hrefs[i];
        const flowConfig = buildFlowConfig(scenario.id, scenario.label, scenario, href);

        console.log(
          `▶ Attempt ${i + 1}/${hrefs.length}: ${scenario.id} with "${flowConfig.conditionName}" (${href})`,
        );

        try {
          await runConditionFlow(page, flowConfig, TEST_USER, baseURL);
          succeeded = true;
          console.log(`✔ Completed ${scenario.id} using "${flowConfig.conditionName}"`);
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (isRetryableError(err) && i < hrefs.length - 1) {
            attempts.push({ href, error: msg });
            console.log(
              `↻ "${flowConfig.conditionName}" can't satisfy ${scenario.id} (${msg.split("\n")[0]}) — trying next`,
            );
            await page.context().clearCookies().catch(() => {});
            continue;
          }
          throw err;
        }
      }

      if (!succeeded) {
        throw new Error(
          `All ${hrefs.length} condition(s) failed scenario ${scenario.id}. Attempts: ${attempts
            .map((a) => `"${a.href}" (${a.error.split("\n")[0]})`)
            .join("; ")}`,
        );
      }
    });
  }
});
