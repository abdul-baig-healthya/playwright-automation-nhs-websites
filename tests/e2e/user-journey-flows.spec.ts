import { test, expect, Page } from "@playwright/test";
import { TEST_USER } from "../fixtures/test-data";
import { JOURNEY_FLOWS } from "../fixtures/journey-flows";
import { PHARMACY_SITES } from "../fixtures/pharmacies";
import {
  fetchConditions,
  getMatchingConditions,
  type SanityCondition,
} from "../helpers/sanity-client";
import { runConditionFlow } from "../helpers/run-flow";
import type { FlowConfig } from "../fixtures/flow-configs";

function projectIdFor(pharmacyName: string): string {
  const site = PHARMACY_SITES.find((p) => p.name === pharmacyName);
  return site?.sanityProjectId ?? "";
}

function buildFlowConfig(
  flowId: string,
  condition: SanityCondition,
): FlowConfig {
  return {
    name: `User Journey ${flowId}`,
    conditionJourneyType: /private/i.test(condition.conditionCategories ?? "")
      ? "private"
      : "nhs",
    conditionName: condition.title,
    booking: {
      appointmentType: "Video",
      useNextAvailableSlot: true,
      autoMoveToNextDate: true,
      maxDateAttempts: 10,
    },
    paymentMethod: "auto",
  };
}

/**
 * Returns true if the error indicates the condition title wasn't visible on
 * /conditions — meaning we should retry with a different condition. Other
 * failures (questionnaire, booking, payment, etc.) bubble up so the test fails
 * for the real reason.
 */
function isConditionNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /not found on \/conditions/i.test(msg);
}

test.describe("User Journey Flows", () => {
  for (const flow of JOURNEY_FLOWS) {
    test(`${flow.id}: ${flow.label}`, async ({ page, baseURL }, testInfo) => {
      page.on("pageerror", (err) =>
        console.log(`[page error] ${err.message}`),
      );
      page.on("response", (res) => {
        if (res.status() >= 400) {
          console.log(`[HTTP ${res.status()}] ${res.url()}`);
        }
      });

      const pharmacyName = testInfo.project.name;
      const projectId = projectIdFor(pharmacyName);
      test.skip(
        !projectId,
        `No sanityProjectId set for "${pharmacyName}" — add it in tests/fixtures/pharmacies.ts`,
      );

      // ─── Step 1: Fetch all conditions from Sanity for this flow ─────────
      let conditions: SanityCondition[] = [];
      await test.step(`Fetch conditions from Sanity (project=${projectId}) for ${flow.id}`, async () => {
        const allConditions = await fetchConditions(projectId);
        console.log(
          `📥 Sanity returned ${allConditions.length} active condition(s) for project ${projectId}`,
        );
        conditions = getMatchingConditions(allConditions, flow.pattern);
        if (conditions.length === 0) {
          throw new Error(
            `No conditions match flow "${flow.id} — ${flow.label}" (${flow.pattern.join(" → ")}) on pharmacy "${pharmacyName}"`,
          );
        }
        console.log(
          `🎯 ${conditions.length} matching condition(s) for ${flow.id}: ${conditions
            .map((c) => `"${c.title}"`)
            .join(", ")}`,
        );
      });
      expect(conditions.length, "must have at least one matching condition").toBeGreaterThan(0);

      // ─── Step 2: Try each condition until one is visible on /conditions ─
      const attempts: { title: string; error: string }[] = [];
      let succeeded = false;
      let usedCondition: SanityCondition | undefined;

      for (let i = 0; i < conditions.length; i++) {
        const condition = conditions[i];
        const flowConfig = buildFlowConfig(flow.id, condition);
        console.log(
          `▶ Attempt ${i + 1}/${conditions.length}: ${flow.id} on ${pharmacyName} with "${condition.title}" (id=${condition.conditionId}, journeyType=${flowConfig.conditionJourneyType})`,
        );

        try {
          await runConditionFlow(page, flowConfig, TEST_USER, baseURL);
          usedCondition = condition;
          succeeded = true;
          break;
        } catch (err) {
          if (isConditionNotFoundError(err) && i < conditions.length - 1) {
            const msg = err instanceof Error ? err.message : String(err);
            attempts.push({ title: condition.title, error: msg });
            console.log(
              `↻ Condition "${condition.title}" not on /conditions — trying next condition`,
            );
            // Reset state for the next attempt
            await page.context().clearCookies().catch(() => {});
            continue;
          }
          throw err;
        }
      }

      if (!succeeded) {
        throw new Error(
          `All ${conditions.length} matching condition(s) for flow ${flow.id} were not visible on /conditions for "${pharmacyName}". Attempts: ${attempts
            .map((a) => `"${a.title}"`)
            .join(", ")}`,
        );
      }

      console.log(
        `✔ Completed ${flow.id} using condition "${usedCondition!.title}"`,
      );
    });
  }
});

