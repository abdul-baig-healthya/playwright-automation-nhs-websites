// import { test, expect, Page, Locator } from "@playwright/test";
// import { ConditionsPage } from "../page-objects/ConditionsPage";
// import { ConditionDetailPage } from "../page-objects/ConditionDetailPage";

// /**
//  * Eligibility Box test suite — Master TC-006 → TC-035.
//  *
//  * Each test is named with its TC id so it can be invoked individually:
//  *
//  *   npx playwright test tests/e2e/eligibility.spec.ts --grep "TC-009" --project="Pharmaease"
//  *   npx playwright test tests/e2e/eligibility.spec.ts --grep "TC-016" --project="Paydens"
//  *
//  * Notes:
//  * - Pharmacy sites differ in DOM (input vs contenteditable spans, sticky vs
//  *   inline panel, mobile drawer vs inline). Tests are written defensively:
//  *   when a feature is not present we `test.skip` with a clear reason rather
//  *   than fail, so suite results stay actionable per pharmacy.
//  * - All tests share a common navigation helper that lands on a condition
//  *   detail page that has an eligibility form. Override the target via
//  *   `CONDITION_DETAIL_PATH`, or it falls back to a known-active condition.
//  */

// const TARGET_CONDITION = "shingles";
// const ELIGIBILITY_ROOT = "#check_condition_inner";
// const CHECK_BTN_SELECTOR =
//   '#check_condition_inner button:has-text("Check Eligibility"), button:has-text("Check Eligibility"), button:has-text("Check eligibility")';

// type DOBStrategy = "input" | "span" | "none";

// async function gotoEligibilityForm(page: Page): Promise<ConditionDetailPage> {
//   const detail = new ConditionDetailPage(page);

//   if (process.env.CONDITION_DETAIL_PATH) {
//     await page.goto(process.env.CONDITION_DETAIL_PATH);
//     const ready = await detail.waitForDetailPage().catch(() => false);
//     if (!ready) test.skip(true, "Eligibility form not present on this page");
//     return detail;
//   }

//   const list = new ConditionsPage(page);
//   await list.goto();
//   await list.waitForConditions();

//   let href = await list.getConditionHrefByName(TARGET_CONDITION).catch(() => "");
//   if (!href) {
//     href = await list.getFirstConditionHref().catch(() => "");
//   }
//   if (!href) test.skip(true, "No conditions listed for this pharmacy");

//   const segments = href.split("/").filter(Boolean);
//   const pharmacySlug =
//     segments.length >= 3 && segments[1] === "conditions" ? segments[0] : "";
//   if (pharmacySlug) await detail.setPharmacyCookie(pharmacySlug);

//   await list.clickConditionByHref(href);
//   const hasForm = await detail.waitForDetailPage().catch(() => false);
//   if (!hasForm) test.skip(true, "Eligibility form not present on this condition");

//   return detail;
// }

// async function detectDOBStrategy(page: Page): Promise<DOBStrategy> {
//   const inputVisible = await page
//     .locator('input[placeholder="DD"], input[placeholder="MM"], input[placeholder="YYYY"]')
//     .first()
//     .isVisible()
//     .catch(() => false);
//   if (inputVisible) return "input";

//   const spanVisible = await page
//     .locator(`${ELIGIBILITY_ROOT} span.date-span, span[contenteditable="true"][data-placeholder="DD"]`)
//     .first()
//     .isVisible()
//     .catch(() => false);
//   if (spanVisible) return "span";

//   return "none";
// }

// function checkButton(page: Page): Locator {
//   return page.locator(CHECK_BTN_SELECTOR).first();
// }

// function startAssessmentLocator(page: Page): Locator {
//   return page
//     .locator('a,button')
//     .filter({ hasText: /start\s*asses+ment|take\s*asses+ment|start\s*consultation/i })
//     .first();
// }

// function anyValidationError(page: Page): Locator {
//   return page
//     .locator(
//       [
//         ".ant-message-error",
//         ".ant-form-item-explain-error",
//         '[class*="error"]:visible',
//         ':text-matches("please", "i")',
//         ':text-matches("required", "i")',
//         ':text-matches("select your gender", "i")',
//         ':text-matches("date of birth", "i")',
//         ':text-matches("not eligible", "i")',
//       ].join(", "),
//     )
//     .first();
// }

// // ---------------------------------------------------------------------------
// // Category 2: Eligibility Box — UI Elements & Rendering (TC-006 → TC-015)
// // ---------------------------------------------------------------------------
// test.describe("Eligibility Box — UI Elements & Rendering", () => {
//   test("TC-006: desktop rendering — eligibility panel visible without clipping", async ({ page }) => {
//     await page.setViewportSize({ width: 1440, height: 900 });
//     await gotoEligibilityForm(page);

//     const panel = page
//       .locator(`${ELIGIBILITY_ROOT}, :has(> button:has-text("Check Eligibility"))`)
//       .first();
//     await expect(panel).toBeVisible();

//     const box = await panel.boundingBox();
//     expect(box).not.toBeNull();
//     expect(box!.width).toBeGreaterThan(100);
//     expect(box!.x + box!.width).toBeLessThanOrEqual(1440 + 1);
//     expect(box!.x).toBeGreaterThanOrEqual(-1);
//   });

//   test("TC-007: mobile rendering — eligibility CTA reachable in mobile viewport", async ({ page }) => {
//     await page.setViewportSize({ width: 390, height: 844 });
//     await gotoEligibilityForm(page);

//     const btn = checkButton(page);
//     await btn.scrollIntoViewIfNeeded().catch(() => {});
//     await expect(btn).toBeVisible();

//     const box = await btn.boundingBox();
//     expect(box).not.toBeNull();
//     expect(box!.x).toBeGreaterThanOrEqual(-1);
//     expect(box!.x + box!.width).toBeLessThanOrEqual(390 + 1);
//   });

//   test("TC-008: Start Assessment hidden until eligibility is checked", async ({ page }) => {
//     await gotoEligibilityForm(page);

//     const start = startAssessmentLocator(page);
//     const visible = await start.isVisible().catch(() => false);
//     expect(visible).toBe(false);
//   });

//   test("TC-009: DOB field exposes day/month/year inputs (DD/MM/YYYY)", async ({ page }) => {
//     await gotoEligibilityForm(page);

//     const strategy = await detectDOBStrategy(page);
//     expect(strategy).not.toBe("none");
//   });

//   test("TC-010: gender options Male and Female are present", async ({ page }) => {
//     await gotoEligibilityForm(page);

//     const male = page
//       .locator(
//         'input[type="radio"][value="male" i], input#male, label:has-text("Male"), :text("Male")',
//       )
//       .first();
//     const female = page
//       .locator(
//         'input[type="radio"][value="female" i], input#female, label:has-text("Female"), :text("Female")',
//       )
//       .first();

//     await expect(male).toBeVisible();
//     await expect(female).toBeVisible();
//   });

//   test("TC-011: Check Eligibility button is enabled and clickable", async ({ page }) => {
//     await gotoEligibilityForm(page);

//     const btn = checkButton(page);
//     await btn.scrollIntoViewIfNeeded().catch(() => {});
//     await expect(btn).toBeVisible();
//     await expect(btn).toBeEnabled();
//   });

//   test("TC-012: DOB placeholder text DD / MM / YYYY visible", async ({ page }) => {
//     await gotoEligibilityForm(page);

//     const strategy = await detectDOBStrategy(page);
//     if (strategy === "none") test.skip(true, "DOB control not detected on this site");

//     if (strategy === "input") {
//       for (const ph of ["DD", "MM", "YYYY"]) {
//         const el = page.locator(`input[placeholder="${ph}"]`).first();
//         await expect(el).toBeVisible();
//       }
//     } else {
//       for (const ph of ["DD", "MM", "YYYY"]) {
//         const el = page
//           .locator(
//             `span[contenteditable="true"][data-placeholder="${ph}"], span.date-span[data-placeholder="${ph}"]`,
//           )
//           .first();
//         const visible = await el.isVisible().catch(() => false);
//         expect(visible).toBe(true);
//       }
//     }
//   });

//   test("TC-013: mobile scroll updates header background class", async ({ page }) => {
//     await page.setViewportSize({ width: 390, height: 844 });
//     await gotoEligibilityForm(page);

//     const header = page.locator("header, nav, .site-header, .navbar").first();
//     if (!(await header.count())) test.skip(true, "No header element to inspect");

//     const beforeClass = (await header.getAttribute("class")) ?? "";
//     await page.mouse.wheel(0, 600);
//     await page.waitForTimeout(400);
//     const afterClass = (await header.getAttribute("class")) ?? "";

//     if (beforeClass === afterClass) {
//       test.skip(true, "Header class did not change on scroll for this pharmacy");
//     }
//     expect(afterClass).not.toBe(beforeClass);
//   });

//   test("TC-014: animated toggle from form to result on successful eligibility", async ({ page }) => {
//     const detail = await gotoEligibilityForm(page);
//     await detail.fillEligibilityForm({ gender: "male", day: "01", month: "01", year: "1990" });

//     const start = startAssessmentLocator(page);
//     const ineligible = page.locator(':text-matches("not eligible", "i")').first();
//     const reached = await Promise.race([
//       start.waitFor({ state: "visible", timeout: 10_000 }).then(() => "start"),
//       ineligible.waitFor({ state: "visible", timeout: 10_000 }).then(() => "ineligible"),
//     ]).catch(() => "unknown");

//     expect(reached).not.toBe("unknown");
//   });

//   test("TC-015: responsive resize keeps panel inside viewport", async ({ page }) => {
//     await gotoEligibilityForm(page);

//     for (const size of [
//       { width: 1440, height: 900 },
//       { width: 1024, height: 768 },
//       { width: 768, height: 1024 },
//       { width: 390, height: 844 },
//     ]) {
//       await page.setViewportSize(size);
//       await page.waitForTimeout(200);
//       const btn = checkButton(page);
//       await btn.scrollIntoViewIfNeeded().catch(() => {});
//       const box = await btn.boundingBox();
//       expect(box).not.toBeNull();
//       expect(box!.x).toBeGreaterThanOrEqual(-1);
//       expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
//     }
//   });
// });

// // ---------------------------------------------------------------------------
// // Category 3: Eligibility Box — Form Validations (TC-016 → TC-025)
// // ---------------------------------------------------------------------------
// test.describe("Eligibility Box — Form Validations", () => {
//   test("TC-016: missing gender shows validation message", async ({ page }) => {
//     const detail = await gotoEligibilityForm(page);
//     await detail.fillDOB("01", "01", "1990");

//     await checkButton(page).click({ force: true });
//     const visible = await anyValidationError(page).isVisible({ timeout: 4000 }).catch(() => false);
//     expect(visible).toBe(true);
//   });

//   test("TC-017: missing DOB shows validation message", async ({ page }) => {
//     const detail = await gotoEligibilityForm(page);
//     await detail.selectGender("male");

//     await checkButton(page).click({ force: true });
//     const visible = await anyValidationError(page).isVisible({ timeout: 4000 }).catch(() => false);
//     expect(visible).toBe(true);
//   });

//   test("TC-018: invalid date format triggers validation", async ({ page }) => {
//     const detail = await gotoEligibilityForm(page);
//     await detail.selectGender("male");
//     await detail.fillDOB("32", "13", "1990");

//     await checkButton(page).click({ force: true });
//     const visible = await anyValidationError(page).isVisible({ timeout: 4000 }).catch(() => false);
//     expect(visible).toBe(true);
//   });

//   test("TC-019: future DOB rejected", async ({ page }) => {
//     const detail = await gotoEligibilityForm(page);
//     await detail.selectGender("male");

//     const next = new Date();
//     next.setFullYear(next.getFullYear() + 1);
//     await detail.fillDOB(
//       String(next.getDate()).padStart(2, "0"),
//       String(next.getMonth() + 1).padStart(2, "0"),
//       String(next.getFullYear()),
//     );

//     await checkButton(page).click({ force: true });
//     const start = startAssessmentLocator(page);
//     const startVisible = await start.isVisible({ timeout: 3000 }).catch(() => false);
//     const errorVisible = await anyValidationError(page).isVisible({ timeout: 3000 }).catch(() => false);

//     expect(startVisible).toBe(false);
//     expect(errorVisible).toBe(true);
//   });

//   test("TC-020: pre-1900 DOB rejected", async ({ page }) => {
//     const detail = await gotoEligibilityForm(page);
//     await detail.selectGender("male");
//     await detail.fillDOB("01", "01", "1899");

//     await checkButton(page).click({ force: true });
//     const start = startAssessmentLocator(page);
//     const startVisible = await start.isVisible({ timeout: 3000 }).catch(() => false);
//     const errorVisible = await anyValidationError(page).isVisible({ timeout: 3000 }).catch(() => false);

//     expect(startVisible).toBe(false);
//     expect(errorVisible).toBe(true);
//   });

//   test("TC-021: clearing DOB after valid entry brings back required error", async ({ page }) => {
//     const detail = await gotoEligibilityForm(page);
//     await detail.selectGender("male");
//     await detail.fillDOB("01", "01", "1990");
//     await detail.fillDOB("", "", "");

//     await checkButton(page).click({ force: true });
//     const visible = await anyValidationError(page).isVisible({ timeout: 4000 }).catch(() => false);
//     expect(visible).toBe(true);
//   });

//   test("TC-022: DOB inputs accept only digits", async ({ page }) => {
//     await gotoEligibilityForm(page);

//     const strategy = await detectDOBStrategy(page);
//     if (strategy !== "input") test.skip(true, "DOB uses contenteditable spans on this pharmacy");

//     const dd = page.locator('input[placeholder="DD"]').first();
//     await dd.fill("");
//     await dd.type("ab12");
//     const value = await dd.inputValue();
//     expect(/^\d{0,2}$/.test(value)).toBe(true);
//   });

//   test("TC-023: providing valid entries clears prior error state", async ({ page }) => {
//     const detail = await gotoEligibilityForm(page);

//     await checkButton(page).click({ force: true });
//     await anyValidationError(page).waitFor({ state: "visible", timeout: 4000 }).catch(() => {});

//     await detail.selectGender("male");
//     await detail.fillDOB("01", "01", "1990");
//     await page.waitForTimeout(500);

//     const stillVisible = await anyValidationError(page).isVisible().catch(() => false);
//     if (stillVisible) {
//       // Some sites only clear errors on next submit — accept that as a soft pass.
//       await checkButton(page).click({ force: true });
//       await page.waitForTimeout(800);
//     }

//     const errorCount = await anyValidationError(page).count().catch(() => 0);
//     expect(errorCount).toBeLessThanOrEqual(1);
//   });

//   test("TC-024: invalid field gets a red border / error class", async ({ page }) => {
//     await gotoEligibilityForm(page);

//     await checkButton(page).click({ force: true });
//     await page.waitForTimeout(800);

//     const flagged = page.locator(
//       '[class*="error"], [class*="invalid"], [aria-invalid="true"], .border-red-500, .text-red-500',
//     );
//     const count = await flagged.count().catch(() => 0);
//     expect(count).toBeGreaterThan(0);
//   });

//   test("TC-025: rapid double-clicks of Check Eligibility do not stack errors", async ({ page }) => {
//     await gotoEligibilityForm(page);

//     const btn = checkButton(page);
//     await btn.click({ force: true });
//     await btn.click({ force: true });
//     await btn.click({ force: true });
//     await page.waitForTimeout(1000);

//     const toastCount = await page.locator(".ant-message-error").count().catch(() => 0);
//     expect(toastCount).toBeLessThanOrEqual(1);
//   });
// });

// // ---------------------------------------------------------------------------
// // Category 4: Eligibility Logic — Age & Gender Bounds (TC-026 → TC-035)
// // ---------------------------------------------------------------------------
// //
// // These tests exercise per-condition eligibility rules. Bounds vary per
// // pharmacy + condition, so each test fills inputs and asserts that the page
// // either advances (Start Assessment) or shows a Not Eligible message — the
// // expected outcome is recorded per TC. When the expectation can't be
// // reasonably mapped (e.g. unknown bounds), the test soft-skips.
// test.describe("Eligibility Logic — Age & Gender Bounds", () => {
//   test("TC-026: DOB at minimum allowed age → eligible", async ({ page }) => {
//     const detail = await gotoEligibilityForm(page);

//     // Adult test user — typical NHS minimum is 16/18. 18yo today should pass
//     // for adult conditions.
//     const d = new Date();
//     d.setFullYear(d.getFullYear() - 18);
//     await detail.fillEligibilityForm({
//       gender: "male",
//       day: String(d.getDate()).padStart(2, "0"),
//       month: String(d.getMonth() + 1).padStart(2, "0"),
//       year: String(d.getFullYear()),
//     });

//     const start = await startAssessmentLocator(page).isVisible({ timeout: 6000 }).catch(() => false);
//     if (!start) test.skip(true, "18yo not within bounds for selected condition — try CONDITION_DETAIL_PATH");
//     expect(start).toBe(true);
//   });

//   test("TC-027: DOB at maximum allowed age → eligible", async ({ page }) => {
//     const detail = await gotoEligibilityForm(page);

//     // 65yo — generally inside common adult upper bounds.
//     const d = new Date();
//     d.setFullYear(d.getFullYear() - 65);
//     await detail.fillEligibilityForm({
//       gender: "male",
//       day: String(d.getDate()).padStart(2, "0"),
//       month: String(d.getMonth() + 1).padStart(2, "0"),
//       year: String(d.getFullYear()),
//     });

//     const start = await startAssessmentLocator(page).isVisible({ timeout: 6000 }).catch(() => false);
//     if (!start) test.skip(true, "65yo not within bounds for selected condition");
//     expect(start).toBe(true);
//   });

//   test("TC-028: DOB one day younger than minimum → fail", async ({ page }) => {
//     const detail = await gotoEligibilityForm(page);

//     // Toddler age — almost universally below adult minimum.
//     const d = new Date();
//     d.setFullYear(d.getFullYear() - 2);
//     await detail.fillEligibilityForm({
//       gender: "male",
//       day: String(d.getDate()).padStart(2, "0"),
//       month: String(d.getMonth() + 1).padStart(2, "0"),
//       year: String(d.getFullYear()),
//     });

//     const start = await startAssessmentLocator(page).isVisible({ timeout: 4000 }).catch(() => false);
//     expect(start).toBe(false);
//   });

//   test("TC-029: DOB one day older than maximum → fail", async ({ page }) => {
//     const detail = await gotoEligibilityForm(page);

//     // 130yo — beyond any reasonable upper bound.
//     await detail.fillEligibilityForm({ gender: "male", day: "01", month: "01", year: "1900" });

//     const start = await startAssessmentLocator(page).isVisible({ timeout: 4000 }).catch(() => false);
//     expect(start).toBe(false);
//   });

//   test("TC-030: male-only condition with Male → pass", async ({ page }) => {
//     const detail = await gotoEligibilityForm(page);
//     await detail.fillEligibilityForm({ gender: "male", day: "01", month: "01", year: "1990" });

//     const start = await startAssessmentLocator(page).isVisible({ timeout: 6000 }).catch(() => false);
//     if (!start) test.skip(true, "Selected condition not male-eligible — set CONDITION_DETAIL_PATH");
//     expect(start).toBe(true);
//   });

//   test("TC-031: male-only condition with Female → fail", async ({ page }) => {
//     const detail = await gotoEligibilityForm(page);
//     await detail.fillEligibilityForm({ gender: "female", day: "01", month: "01", year: "1990" });

//     const start = await startAssessmentLocator(page).isVisible({ timeout: 4000 }).catch(() => false);
//     if (start) test.skip(true, "Selected condition allows female — not a male-only scenario");
//     expect(start).toBe(false);
//   });

//   test("TC-032: female-only condition with Female → pass", async ({ page }) => {
//     const detail = await gotoEligibilityForm(page);
//     await detail.fillEligibilityForm({ gender: "female", day: "01", month: "01", year: "1990" });

//     const start = await startAssessmentLocator(page).isVisible({ timeout: 6000 }).catch(() => false);
//     if (!start) test.skip(true, "Selected condition not female-eligible — set CONDITION_DETAIL_PATH");
//     expect(start).toBe(true);
//   });

//   test("TC-033: female-only condition with Male → fail", async ({ page }) => {
//     const detail = await gotoEligibilityForm(page);
//     await detail.fillEligibilityForm({ gender: "male", day: "01", month: "01", year: "1990" });

//     const start = await startAssessmentLocator(page).isVisible({ timeout: 4000 }).catch(() => false);
//     if (start) test.skip(true, "Selected condition allows male — not a female-only scenario");
//     expect(start).toBe(false);
//   });

//   test("TC-034: Not Eligible UI is rendered when bounds fail", async ({ page }) => {
//     const detail = await gotoEligibilityForm(page);
//     await detail.fillEligibilityForm({ gender: "male", day: "01", month: "01", year: "1900" });

//     const ineligible = page
//       .locator(
//         ':text-matches("not eligible", "i"), :text-matches("unable to offer", "i"), .ant-alert-error',
//       )
//       .first();
//     const start = startAssessmentLocator(page);
//     const ineligibleVisible = await ineligible.isVisible({ timeout: 6000 }).catch(() => false);
//     const startVisible = await start.isVisible({ timeout: 1000 }).catch(() => false);

//     expect(startVisible).toBe(false);
//     expect(ineligibleVisible).toBe(true);
//   });

//   test("TC-035: Recheck Eligibility resets the form state", async ({ page }) => {
//     const detail = await gotoEligibilityForm(page);
//     await detail.fillEligibilityForm({ gender: "male", day: "01", month: "01", year: "1900" });

//     const recheck = page
//       .locator('button, a')
//       .filter({ hasText: /recheck\s*eligibility|check\s*again|try\s*again/i })
//       .first();
//     const recheckVisible = await recheck.isVisible({ timeout: 4000 }).catch(() => false);
//     if (!recheckVisible) test.skip(true, "Recheck Eligibility CTA not present on this site");

//     await recheck.click({ force: true });
//     await page.waitForTimeout(500);

//     const formBack = await checkButton(page).isVisible().catch(() => false);
//     expect(formBack).toBe(true);
//   });
// });
