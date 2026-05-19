import { test, expect, type APIRequestContext } from "@playwright/test";
import { TEST_USER, BOOKING_PREFERENCES } from "../fixtures/test-data";
import { runConditionFlow } from "../helpers/run-flow";
import type { FlowConfig } from "../fixtures/flow-configs";

// ── Sitemap helpers (same pattern as seo-sitemap.spec.ts) ─────────────────────

function extractLocs(xml: string): string[] {
  const matches = xml.match(/<loc>([\s\S]*?)<\/loc>/gi) ?? [];
  return matches.map((m) => m.replace(/<\/?loc>/gi, "").trim()).filter(Boolean);
}

async function fetchAllSitemapUrls(
  request: APIRequestContext,
  sitemapUrl: string,
  visited = new Set<string>(),
): Promise<string[]> {
  if (visited.has(sitemapUrl)) return [];
  visited.add(sitemapUrl);

  const res = await request.get(sitemapUrl);
  if (!res.ok()) {
    console.warn(`⚠ Could not fetch sitemap at ${sitemapUrl} (${res.status()})`);
    return [];
  }

  const xml = await res.text();
  const locs = extractLocs(xml);

  if (xml.includes("<sitemapindex")) {
    const all: string[] = [];
    for (const child of locs) {
      all.push(...(await fetchAllSitemapUrls(request, child, visited)));
    }
    return all;
  }

  return locs;
}

// ── All Conditions spec ───────────────────────────────────────────────────────

test.describe("All Conditions", () => {
  /**
   * Fetches every /conditions/<slug> URL from the pharmacy's sitemap.xml, detects
   * whether each is a pre-consult (has "Check Eligibility" form) or private
   * medication (Start Assessment directly), then runs the appropriate flow using
   * the existing runConditionFlow infrastructure.
   *
   * Each condition runs in its own isolated browser context to avoid cross-
   * contamination from signup cookies/sessions.
   *
   * Failures are accumulated rather than aborting the whole test; a final
   * assertion reports all failures at once.
   */
  test(
    "run all conditions from sitemap",
    async ({ browser, request, baseURL }) => {
      // 90-minute overall cap — large condition lists can take a long time
      test.setTimeout(90 * 60 * 1000);
      const base = (baseURL ?? process.env.BASE_URL ?? "").replace(/\/$/, "");
      const sitemapUrl = `${base}/sitemap.xml`;

      console.log(`📥 Fetching sitemap: ${sitemapUrl}`);
      const allUrls = await fetchAllSitemapUrls(request, sitemapUrl);

      // Keep only leaf /conditions/<slug> pages (exclude the listing /conditions)
      const conditionUrls = allUrls.filter((u) =>
        /\/conditions\/[^/#?]+\/?$/.test(u),
      );

      console.log(
        `🔗 Found ${conditionUrls.length} condition URL(s) in sitemap`,
      );
      expect(
        conditionUrls.length,
        "Sitemap must contain at least one /conditions/<slug> URL",
      ).toBeGreaterThan(0);

      const failed: { url: string; type: string; error: string }[] = [];

      for (const conditionUrl of conditionUrls) {
        // Each condition gets a fresh isolated browser context
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
          await test.step(`Condition: ${conditionUrl}`, async () => {
            // Navigate to the condition detail page
            await page.goto(conditionUrl);
            await page.waitForLoadState("domcontentloaded");
            await page
              .waitForLoadState("networkidle", { timeout: 15_000 })
              .catch(() => {});

            // Dismiss cookie banner
            await page
              .locator(
                'button:has-text("Accept All"), button:has-text("Accept Cookies"), button:has-text("Accept")',
              )
              .first()
              .click()
              .catch(() => {});

            // Scroll to trigger lazy-rendered eligibility widget
            await page.evaluate(() => window.scrollBy(0, 600)).catch(() => {});
            await page.waitForTimeout(500);

            // Detect condition type:
            // Pre-consult → has "Check Eligibility" button → use nhs flow
            // Private medication → has "Start Assessment" directly → use private flow
            const hasEligibilityForm = await page
              .locator(
                'button:has-text("Check Eligibility"), button:has-text("Check eligibility")',
              )
              .filter({ visible: true })
              .first()
              .isVisible()
              .catch(() => false);

            const conditionJourneyType: "nhs" | "private" = hasEligibilityForm
              ? "nhs"
              : "private";

            // Extract condition name from the page heading
            const conditionName = await page
              .locator("h1")
              .first()
              .innerText()
              .catch(
                () =>
                  conditionUrl
                    .split("/conditions/")[1]
                    ?.replace(/[/-]/g, " ")
                    ?.replace(/\/$/, "") ?? "unknown",
              );

            console.log(
              `  → "${conditionName.trim()}": ${conditionJourneyType} (${
                hasEligibilityForm ? "pre-consult" : "private medication"
              })`,
            );

            const config: FlowConfig = {
              name: conditionName.trim(),
              conditionJourneyType,
              conditionName: conditionName.trim(),
              conditionHref: conditionUrl,
              booking: {
                appointmentType: BOOKING_PREFERENCES.appointmentType,
                useNextAvailableSlot: true,
                autoMoveToNextDate: true,
                maxDateAttempts: 10,
              },
              paymentMethod: "auto",
            };

            await runConditionFlow(page, config, TEST_USER, baseURL);
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const conditionJourneyType =
            conditionUrl.includes("check-eligibility") ? "nhs" : "unknown";
          console.error(
            `✗ FAILED — ${conditionUrl}\n  ${msg.split("\n")[0]}`,
          );
          failed.push({ url: conditionUrl, type: conditionJourneyType, error: msg });
        } finally {
          await context.close().catch(() => {});
        }
      }

      if (failed.length > 0) {
        const summary = failed
          .map((f, i) => `${i + 1}. ${f.url}\n   ${f.error.split("\n")[0]}`)
          .join("\n");
        throw new Error(
          `${failed.length}/${conditionUrls.length} condition(s) failed:\n${summary}`,
        );
      }

      console.log(
        `✅ All ${conditionUrls.length} condition(s) completed successfully.`,
      );
    },
  );
});
