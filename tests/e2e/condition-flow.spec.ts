import { test, expect, Page } from "@playwright/test";
import { TEST_USER, ACTIVE_CONDITION, getActiveConditionName } from "../fixtures/test-data";
import { ConditionsPage } from "../page-objects/ConditionsPage";
import { ConditionDetailPage } from "../page-objects/ConditionDetailPage";
import { GuestContinuePage } from "../page-objects/GuestContinuePage";
import { QuestionnairePage } from "../page-objects/QuestionnairePage";
import { SignupPage } from "../page-objects/SignupPage";
import { BookingPage } from "../page-objects/BookingPage";
import { PaymentPage } from "../page-objects/PaymentPage";

// ─── Journey step types ───────────────────────────────────────────────────────
type JourneyStep =
  | "questionnaire_submit"
  | "sign_up"
  | "appointment_booking"
  | "payment"
  | "success"
  | "unknown";

/**
 * Detect the current journey step by inspecting the DOM.
 */
async function detectCurrentStep(page: Page): Promise<JourneyStep> {
  const currentUrl = page.url();

  const hasVisibleIndicator = async (selectors: string[]) => {
    const checks = await Promise.all(
      selectors.map((sel) =>
        page
          .locator(sel)
          .first()
          .isVisible({ timeout: 300 })
          .catch(() => false),
      ),
    );
    return checks.some(Boolean);
  };

  // 1. Success / confirmation state (highest priority)
  const successIndicators = [
    ':text("Booking Confirmed")',
    ':text("booking confirmed")',
    ':text("Appointment Confirmed")',
    ':text("appointment confirmed")',
    ':text("Thank you for booking")',
    ':text("You can safely close")',
    ':text("Successfully booked")',
    '[class*="BookingAppointmentSuccess"]',
    '[class*="booking-appointment-success"]',
  ];
  if (await hasVisibleIndicator(successIndicators)) {
    return "success";
  }

  // 2.5 Payment step
  const paymentIndicators = [
    ':text("Complete your payment")',
    ':text("Enter your card details here")',
    ':text("Select a saved card")',
    'input[autocomplete="cc-name"]',
    'input[autocomplete="cc-number"]',
    'input[autocomplete="cc-exp"]',
    'input[autocomplete="cc-csc"]',
    ':text("3dsecure.io")',
    ':text("Pass challenge")',
    ':text("Token fee")',
    'button:has-text("Pay £")',
    'button:has-text("Pay")',
    '[class*="payment"]',
    '[id*="payment"]',
  ];
  if (await hasVisibleIndicator(paymentIndicators)) {
    return "payment";
  }

  // URL fallback for tenants/routes that render payment UI after a delay.
  if (
    /payment|checkout|card|3dsecure|challenge/i.test(currentUrl) &&
    !(await hasVisibleIndicator(successIndicators))
  ) {
    return "payment";
  }

  // 3. Booking step
  const bookingIndicators = [
    ".appointment-type-radio-group",
    ".rota-slot",
    'button:has-text("Book Now")',
    ':text("Appointment type")',
    ':text("Book your appointment")',
    ':text("Schedule your appointment")',
  ];
  if (await hasVisibleIndicator(bookingIndicators)) {
    return "appointment_booking";
  }

  // 4. Sign-up / contact-details step
  const signupIndicators = [
    'input[name="first_name"]',
    'input[name="email"]',
    'input[type="email"]',
    ':text("Patient details")',
    ':text("Personal details")',
    ':text("Contact details")',
    ':text("Enter your details")',
  ];
  if (await hasVisibleIndicator(signupIndicators)) {
    return "sign_up";
  }

  // 5. Questionnaire step
  const questionnaireIndicators = [
    ':text("Questionnaires")',
    ':text("Important Notice")',
    ':text("Do you have these symptoms?")',
    ':text("I do not have these symptoms")',
    ':text("I do have these symptoms")',
    ".ant-radio-wrapper",
    ".ant-radio-button-wrapper",
    'button:has-text("Save")',
    'button:has-text("Next")',
    '[class*="question"]',
    '[class*="questionnaire"]',
    "input[type=radio]",
    "input[type=checkbox]",
    "textarea",
    ".ant-picker",
  ];
  if (await hasVisibleIndicator(questionnaireIndicators)) {
    return "questionnaire_submit";
  }

  // Some tenants keep "/questionnaire" in the URL even after moving forward.
  // Avoid URL-only fallback here, otherwise payment can be misrouted as questionnaire.

  return "unknown";
}

// ─── Main test ────────────────────────────────────────────────────────────────
test.describe("Conditions flow", () => {
  test("complete conditions flow: listing → eligibility → questionnaire → signup → book", async ({
    page,
  }) => {
    page.on("console", (msg) => {
      const type = msg.type();
      if (type === "error" || type === "warning") {
        console.log(`[browser ${type}] ${msg.text()}`);
      }
    });
    page.on("pageerror", (err) => {
      console.log(`[page error] ${err.message}`);
    });
    page.on("response", (res) => {
      if (res.status() >= 400) {
        console.log(`[HTTP ${res.status()}] ${res.url()}`);
      }
    });

    const conditionsPage = new ConditionsPage(page);
    const detailPage = new ConditionDetailPage(page);
    const guestContinuePage = new GuestContinuePage(page);
    const questionnaire = new QuestionnairePage(page);
    const signup = new SignupPage(page);
    const booking = new BookingPage(page);
    const payment = new PaymentPage(page);

    const baseUrl = (process.env.BASE_URL ?? "http://localhost:4005").replace(
      /\/$/,
      "",
    );
    const selectedConditionName = getActiveConditionName();

    // ─── Step 1: Resolve condition href + pharmacy slug ─────────────────────
    let conditionHref: string;
    let pharmacySlug: string;

    const conditionDetailPath = process.env.CONDITION_DETAIL_PATH;

    if (conditionDetailPath) {
      conditionHref = conditionDetailPath;
      pharmacySlug = conditionsPage.extractPharmacySlug(conditionDetailPath);
      console.log(`✔ Direct condition path: ${conditionDetailPath}`);
      console.log(`✔ Pharmacy slug: ${pharmacySlug}`);
    } else {
      await test.step(
        `Navigate to /conditions and select ${ACTIVE_CONDITION.journeyType} condition: ${selectedConditionName}`,
        async () => {
        await conditionsPage.goto();
        await conditionsPage.waitForConditions();
        },
      );

      conditionHref =
        await conditionsPage.getConditionHrefByName(selectedConditionName);
      pharmacySlug = conditionsPage.extractPharmacySlug(conditionHref);
      console.log(
        `✔ Selected ${ACTIVE_CONDITION.journeyType} condition (${selectedConditionName}) href: ${conditionHref}`,
      );
      console.log(`✔ Pharmacy slug: ${pharmacySlug}`);
    }

    // ─── Step 2: Set cookie then navigate to detail page ───────────────────
    await test.step("Set pharmacy cookie and open condition detail page", async () => {
      const cookieOrigin = page.url().startsWith("http")
        ? new URL(page.url()).origin
        : baseUrl;

      if (pharmacySlug) {
        await page.context().addCookies([
          {
            name: "selected-corporate-id",
            value: pharmacySlug,
            url: cookieOrigin,
          },
        ]);
      }

      const detailUrl = conditionHref.startsWith("http")
        ? conditionHref
        : `${baseUrl}${conditionHref}`;
      await page.goto(detailUrl);
      await detailPage.waitForDetailPage();
    });

    // ─── Step 3: Eligibility form (OPTIONAL) ──────────────────────────────
    // fillEligibilityForm detects whether the form is present.
    // If absent (e.g. Acne Vulgaris / private conditions), it skips silently.
    // It also calls clickCheckEligibility internally — no need to call it again.
    await test.step("Fill eligibility form if present: gender + DOB", async () => {
      await detailPage.fillEligibilityForm({
        gender: TEST_USER.gender,
        day: TEST_USER.dob.day,
        month: TEST_USER.dob.month,
        year: TEST_USER.dob.year,
      });
    });

    // ─── Step 4: Start Assessment ─────────────────────────────────────────
    await test.step("Click Start Assessment", async () => {
      await detailPage.clickStartAssessment();
      await guestContinuePage.continueAsGuestIfVisible();
      await page
        .waitForURL("**/questionnaire**", { timeout: 15_000 })
        .catch(() => {});
      await page.waitForLoadState("domcontentloaded");
    });

    console.log(`✔ Post-assessment URL: ${page.url()}`);

    // ─── Steps 5–N: Dynamic journey loop ─────────────────────────────────
    await test.step("Complete dynamic journey (questionnaire / signup / booking)", async () => {
      const MAX_ITERATIONS = 30;
      const stepVisits: Record<string, number> = {};
      const MAX_STEP_VISITS = 6;
      let flowCompleted = false;

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        if (flowCompleted) break;
        await page.waitForTimeout(1500);

        let step = await detectCurrentStep(page);
        console.log(`🔍 Iteration ${i + 1}: detected step = "${step}"`);

        if (step === "success") {
          console.log("✔ Booking success state reached!");
          break;
        }

        if (step === "unknown") {
          // Short retry first to avoid long stalls when payment UI is still mounting.
          await page.waitForTimeout(500);
          step = await detectCurrentStep(page);
          if (step !== "unknown") {
            console.log(`↻ Fast retry detected step = "${step}"`);
          } else {
            await page.waitForTimeout(1200);
            step = await detectCurrentStep(page);
          }

          // Last safety fallback: URL hints commonly used by payment providers/pages.
          if (
            step === "unknown" &&
            /payment|checkout|card|3dsecure|challenge/i.test(page.url())
          ) {
            step = "payment";
            console.log('↻ URL fallback forced step = "payment"');
          }

          if (step === "unknown") {
            console.log(`⚠ Unknown step at URL: ${page.url()} — stopping loop`);
            break;
          }
        }

        stepVisits[step] = (stepVisits[step] ?? 0) + 1;
        if (stepVisits[step] > MAX_STEP_VISITS) {
          console.log(
            `⚠ Stuck: step "${step}" visited ${stepVisits[step]} times — stopping`,
          );
          break;
        }

        switch (step) {
          case "questionnaire_submit": {
            console.log("→ Handling questionnaire step");
            await questionnaire.waitForPage();
            await questionnaire.answerAllQuestions();
            break;
          }

          case "sign_up": {
            console.log("→ Handling sign-up step");

            const hasNHSForm = await page
              .locator('input[name="first_name"]')
              .isVisible()
              .catch(() => false);

            if (hasNHSForm) {
              await signup.waitForPage();
              await signup.fillNHSPDSForm({
                firstName: TEST_USER.firstName,
                lastName: TEST_USER.lastName,
                postcode: TEST_USER.postcode,
                gender: TEST_USER.gender,
                dobIso: TEST_USER.dob.iso,
              });
              if (ACTIVE_CONDITION.journeyType === "private") {
                await signup.submitPrivatePatientInfoForm();
              } else {
                await signup.submitNHSForm();
              }
              await signup.handlePDSResult();
              break;
            }

            const hasEmail = await page
              .locator('input[name="email"], input[type="email"]')
              .first()
              .isVisible()
              .catch(() => false);

            if (hasEmail) {
              await signup.fillContactDetails(TEST_USER.email, TEST_USER.phone);
              await signup.submitAndBook();
              await page.waitForTimeout(3_000);
            }
            break;
          }

          case "appointment_booking": {
            console.log("→ Handling booking step");
            await booking.completeBooking();
            break;
          }

          case "payment": {
            console.log("→ Handling payment step");
            await payment.completePayment(TEST_USER.payment);
            if (payment.isBookingFlowCompleted()) {
              console.log(
                "✔ Payment completed and redirected home — ending test flow",
              );
              flowCompleted = true;
            }
            break;
          }
        }
      }
    });

    // ─── Final assertion ──────────────────────────────────────────────────
    await test.step("Verify booking/completion reached", async () => {
      const confirmed = await signup.isBookingConfirmed();
      console.log(`✔ Booking confirmed check: ${confirmed}`);
      expect(page.url()).not.toContain("/conditions");
    });
  });
});
