import { Page } from "@playwright/test";

/**
 * Handles the NHS PDS identity check form and subsequent contact / booking steps.
 *
 * NHS PDS flow (questionnaire context — PatientMainPage.jsx):
 *  1. Fill first_name, last_name, postcode (DOB + gender are disabled/pre-filled
 *     from URL params — never editable here).
 *  2. Click "Check Records" → NHS API call (returns 801/404 for test data).
 *  3. PatientSignUpForm appears with "Try Again" + "private consultation" link.
 *  4. Click "Yes, I want to continue with the private consultation" → opens modal.
 *  5. Fill phone, confirmPhone, email, confirmEmail in the modal.
 *  6. Click "Confirm" (footerElement button rendered by questionnaire pagebuilder).
 */
export class SignupPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  private normalizeUkPhoneForInput(phone: string): string {
    const digitsOnly = phone.replace(/\D/g, "");
    if (digitsOnly.startsWith("44") && digitsOnly.length > 10) {
      return `0${digitsOnly.slice(2)}`;
    }
    return digitsOnly;
  }

  private getContactFormScope() {
    return this.page
      .locator(
        [
          '.ant-modal-content:has(input.PhoneInputInput)',
          '.ant-modal-content:has(input[name="email"])',
          '[role="dialog"]:has(input.PhoneInputInput)',
          '[role="dialog"]:has(input[name="email"])',
          'form:has(input[name="email"])',
        ].join(", "),
      )
      .first();
  }

  /** Wait for the NHS PDS identity form to be visible. */
  async waitForPage() {
    await this.page.waitForLoadState("domcontentloaded");
    await this.page
      .locator(
        [
          'input[name="first_name"]',
          'input[name="last_name"]',
          ':text("Create your account")',
          ':text("Register")',
          ':text("Sign up")',
        ].join(", "),
      )
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
  }

  /**
   * Fill the NHS PDS form.
   * NOTE: DOB and gender are hardcoded disabled in PatientMainPage.jsx
   * (pre-filled from URL ?dob / ?gender params) — only fill the 3 editable fields.
   */
  async fillNHSPDSForm(data: {
    firstName: string;
    lastName: string;
    postcode: string;
    gender: "male" | "female"; // kept in signature for API compat, not used
    dobIso: string; // kept in signature for API compat, not used
  }) {
    const firstNameInput = this.page
      .locator('input[name="first_name"]')
      .first();
    await firstNameInput.waitFor({ state: "visible" });
    await firstNameInput.clear();
    await firstNameInput.fill(data.firstName);

    const lastNameInput = this.page.locator('input[name="last_name"]').first();
    await lastNameInput.clear();
    await lastNameInput.fill(data.lastName);

    const postcodeInput = this.page.locator('input[name="postcode"]').first();
    await postcodeInput.clear();
    await postcodeInput.fill(data.postcode);
  }

  /**
   * Click the "Check Records" submit button on the NHS PDS form.
   */
  async submitNHSForm() {
    const submitBtn = this.page
      .locator(
        [
          'button:has-text("Check Records")',
          'button:has-text("Continue")',
          'button:has-text("Check")',
          'button[type="submit"]',
        ].join(", "),
      )
      .first();

    await submitBtn.waitFor({ state: "visible" });
    await submitBtn.click();
  }

  /**
   * After the NHS PDS check:
   *   - Record NOT matched (test-data case): PatientSignUpForm shows
   *     "Yes, I want to continue with the private consultation" link + "Try Again".
   *     We click the private-consultation link to open the contact-details modal.
   *   - Record matched: contact fields are visible directly (no click needed).
   */
  async handlePDSResult() {
    // Wait up to 45 s for any post-PDS indicator to appear.
    const resultLocator = this.page
      .locator(
        [
          'span:has-text("Yes, I want to continue with the private consultation")',
          'button:has-text("Try Again")',
          'input[name="email"]',
          ':text("records found")',
          ':text("No record found")',
          ':text("successfully verified")',
          ':text("could not find any NHS records")',
        ].join(", "),
      )
      .first();

    await resultLocator.waitFor({ state: "visible", timeout: 45_000 });

    // No-match path: click "Yes, I want to continue with the private consultation"
    // IMPORTANT: use the FULL text to avoid matching the bold "private consultation"
    // text in the paragraph above (which is not clickable).
    const privateLink = this.page
      .locator(
        'span:has-text("Yes, I want to continue with the private consultation")',
      )
      .first();
    if (await privateLink.isVisible().catch(() => false)) {
      console.log(
        "[SignupPage] Clicking 'private consultation' link to open modal",
      );
      await privateLink.click();
      // Wait for the Ant Design modal to open (PhoneInput becomes visible)
      await this.page
        .locator(
          ".ant-modal-body input.PhoneInputInput, .ant-modal-content input.PhoneInputInput, .ant-modal input.PhoneInputInput",
        )
        .first()
        .waitFor({ state: "visible", timeout: 20_000 });
      console.log("[SignupPage] Contact-details modal is open");
    }
  }

  /**
   * Fill contact details inside the modal that opens after clicking the
   * private-consultation link (or directly when record was matched).
   *
   * Modal fields:
   *  - phone / confirmPhone  → react-phone-number-input (.PhoneInputInput)
   *  - email                 → name="email"
   *  - confirmEmail          → name="confirmEmail"
   *
   * Uses locator-scoped pressSequentially so focus is guaranteed to stay on
   * the correct element (global keyboard.type() can lose focus mid-fill).
   */
  async fillContactDetails(email: string, phone: string) {
    const scope = this.getContactFormScope();

    // Wait for email field to confirm modal/form is ready
    const emailInput = scope.locator('input[name="email"]').first();
    await emailInput.waitFor({ state: "visible", timeout: 20_000 });
    console.log("[SignupPage] Contact-details form ready — starting fill");

    // ── Phone fields (react-phone-number-input renders as .PhoneInputInput) ──
    const phoneInputs = scope.locator("input.PhoneInputInput");
    const phoneCount = await phoneInputs.count();
    console.log(`[SignupPage] PhoneInputInput count: ${phoneCount}`);
    const normalizedPhone = this.normalizeUkPhoneForInput(phone);
    console.log(
      `[SignupPage] Normalized phone for input: "${normalizedPhone}"`,
    );

    // Helper: fill ONE react-phone-number-input field
    const fillPhoneField = async (idx: number, label: string) => {
      const inp = phoneInputs.nth(idx);
      await inp.scrollIntoViewIfNeeded().catch(() => {});
      await inp.click();
      await inp.press("Control+a");
      await this.page.waitForTimeout(50);
      await inp.press("Backspace");
      await this.page.waitForTimeout(80);
      await inp.pressSequentially(normalizedPhone, { delay: 60 });
      await this.page.waitForTimeout(150);

      // Blur to run field-level Formik validation
      await inp.press("Tab");
      await this.page.waitForTimeout(250);

      const displayed = await inp.inputValue().catch(() => "?");
      console.log(
        `[SignupPage] ${label} display value after fill: "${displayed}"`,
      );
    };

    if (phoneCount >= 1) {
      await fillPhoneField(0, "phone");
    } else {
      // Fallback: generic tel input
      const telInput = scope.locator('input[type="tel"]').first();
      if (await telInput.isVisible().catch(() => false)) {
        await telInput.click();
        await telInput.press("Control+a");
        await telInput.press("Backspace");
        await telInput.pressSequentially(normalizedPhone, { delay: 60 });
        await telInput.press("Tab");
        const v = await telInput.inputValue().catch(() => "?");
        console.log(`[SignupPage] tel fallback value: "${v}"`);
      }
    }

    if (phoneCount >= 2) {
      await fillPhoneField(1, "confirmPhone");
    }

    // ── Email ────────────────────────────────────────────────────────────────
    await emailInput.click();
    await emailInput.clear();
    await emailInput.fill(email);
    await emailInput.press("Tab");
    console.log(`[SignupPage] Email filled: "${email}"`);

    // ── Confirm email ────────────────────────────────────────────────────────
    const confirmEmailInput = scope.locator('input[name="confirmEmail"]').first();
    if (await confirmEmailInput.isVisible().catch(() => false)) {
      await confirmEmailInput.click();
      await confirmEmailInput.clear();
      await confirmEmailInput.fill(email);
      await confirmEmailInput.press("Tab");
      console.log("[SignupPage] Confirm-email filled");
    }

    // Let Formik batch all setFieldValue calls and re-render
    await this.page.waitForTimeout(700);
    console.log("[SignupPage] fillContactDetails complete");
  }

  /**
   * Click the Confirm button inside the contact-details modal.
   * Waits for the modal to close (success) and waits for redirect to booking page.
   */
  async submitAndBook() {
    const scope = this.getContactFormScope();
    const submitCandidates = [
      "button.button-primary",
      ".ant-modal-footer button",
      "button",
      'button:has-text("Confirm")',
      'button:has-text("Continue")',
      'button:has-text("Book Appointment")',
      'button[type="submit"]',
    ];

    let submitButton = this.page.locator("_unused_").first();
    let isVisible = false;
    let isEnabled = false;

    const scopeButtons = await scope
      .locator("button")
      .evaluateAll((els) =>
        els.map((el) => ({
          text: (el.textContent ?? "").trim(),
          type: (el as HTMLButtonElement).type || "",
          disabled: (el as HTMLButtonElement).disabled,
          className: (el as HTMLElement).className || "",
        })),
      )
      .catch(() => [] as Array<{
        text: string;
        type: string;
        disabled: boolean;
        className: string;
      }>);
    console.log(
      `[SignupPage] Scoped buttons: ${JSON.stringify(scopeButtons.slice(0, 8))}`,
    );

    for (const selector of submitCandidates) {
      const candidate = scope.locator(selector).filter({ hasText: /confirm|continue|book appointment/i }).first();
      const genericCandidate =
        selector === "button" ? scope.locator(selector).first() : candidate;
      const target = selector === "button" ? genericCandidate : candidate;
      const visible = await target.isVisible().catch(() => false);
      if (!visible) continue;

      const text = (await target.textContent().catch(() => ""))?.trim() ?? "";
      const enabled = await target.isEnabled().catch(() => false);
      console.log(
        `[SignupPage] Submit candidate ${selector} -> text="${text}", enabled=${enabled}`,
      );

      if (
        /confirm|continue|book appointment/i.test(text) ||
        selector === 'button[type="submit"]'
      ) {
        submitButton = target;
        isVisible = true;
        isEnabled = enabled;
        break;
      }
    }

    if (!isVisible) {
      const form = scope.locator("form").first();
      if (await form.isVisible().catch(() => false)) {
        console.log("[SignupPage] No scoped button found — trying form.requestSubmit()");
        await form.evaluate((el: HTMLFormElement) => el.requestSubmit());
        await this.page.waitForTimeout(1500);
      }
    }

    if (!isVisible) {
      const scopedConfirm = scope.locator('button:has-text("Confirm")').last();
      isVisible = await scopedConfirm.isVisible().catch(() => false);
      isEnabled = isVisible
        ? await scopedConfirm.isEnabled().catch(() => false)
        : false;
      if (isVisible) {
        submitButton = scopedConfirm;
      }
    }

    console.log(
      `[SignupPage] Confirm button — visible: ${isVisible}, enabled: ${isEnabled}`,
    );

    if (!isVisible) {
      console.log("[SignupPage] WARNING: no Confirm/submit button found");
      return;
    }

    if (!isEnabled) {
      const visibleErrors = await this.page
        .locator(
          ".ant-modal .text-red-500, .ant-modal [class*='text-red'], .ant-modal [class*='error'], [class*='text-red'], [class*='error']",
        )
        .allTextContents()
        .catch(() => [] as string[]);
      const errorText = visibleErrors
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 10)
        .join(" | ");
      console.log(
        `[SignupPage] Submit button is disabled. Visible validation text: ${errorText || "none"}`,
      );
      return;
    }

    // Log any visible form validation errors before clicking
    const preErrors = await this.page
      .locator(
        ".ant-modal .text-red-500, .ant-modal [class*='text-red'], .ant-modal [class*='Error'], .ant-modal [class*='error-text'], .ant-modal p[style*='color: red']",
      )
      .allTextContents()
      .catch(() => [] as string[]);
    const preErrText = preErrors.filter((t) => t.trim()).join(" | ");
    if (preErrText)
      console.log(
        `[SignupPage] Validation errors before Confirm: ${preErrText}`,
      );

    const currentUrl = this.page.url();
    await submitButton.click({ force: true });
    console.log("[SignupPage] Clicked Confirm/submit — waiting for next state");

    await Promise.race([
      this.page
        .waitForURL((url) => url.href !== currentUrl, { timeout: 20_000 })
        .catch(() => {}),
      this.page
        .locator(".appointment-type-radio-group, .rota-slot, button:has-text(\"Book Now\")")
        .first()
        .waitFor({ state: "visible", timeout: 20_000 })
        .catch(() => {}),
      this.page
        .locator(".ant-modal")
        .first()
        .waitFor({ state: "hidden", timeout: 20_000 })
        .catch(() => {}),
    ]);

    console.log(`[SignupPage] URL after submit: ${this.page.url()}`);

    let stillOnSignup = await scope
      .locator('input[name="email"], input[name="first_name"], input.PhoneInputInput')
      .first()
      .isVisible()
      .catch(() => false);

    if (stillOnSignup) {
      const form = scope.locator("form").first();
      if (await form.isVisible().catch(() => false)) {
        console.log(
          "[SignupPage] Still on signup after button click — trying form.requestSubmit()",
        );
        await form.evaluate((el: HTMLFormElement) => el.requestSubmit());
        await Promise.race([
          this.page
            .waitForURL((url) => url.href !== currentUrl, { timeout: 10_000 })
            .catch(() => {}),
          this.page
            .locator(
              ".appointment-type-radio-group, .rota-slot, button:has-text(\"Book Now\")",
            )
            .first()
            .waitFor({ state: "visible", timeout: 10_000 })
            .catch(() => {}),
          scope.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {}),
        ]);
      } else {
        console.log(
          "[SignupPage] No visible form element in scope after button click",
        );
      }

      stillOnSignup = await scope
        .locator(
          'input[name="email"], input[name="first_name"], input.PhoneInputInput',
        )
        .first()
        .isVisible()
        .catch(() => false);

      if (stillOnSignup) {
        const confirmEmailInput = scope
          .locator('input[name="confirmEmail"]')
          .first();
        if (await confirmEmailInput.isVisible().catch(() => false)) {
          console.log(
            "[SignupPage] Still on signup after button click — pressing Enter on confirmEmail",
          );
          await confirmEmailInput.press("Enter").catch(() => {});
          await Promise.race([
            this.page
              .waitForURL((url) => url.href !== currentUrl, {
                timeout: 10_000,
              })
              .catch(() => {}),
            this.page
              .locator(
                ".appointment-type-radio-group, .rota-slot, button:has-text(\"Book Now\")",
              )
              .first()
              .waitFor({ state: "visible", timeout: 10_000 })
              .catch(() => {}),
            scope.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {}),
          ]);
        }
      }

      stillOnSignup = await scope
        .locator(
          'input[name="email"], input[name="first_name"], input.PhoneInputInput',
        )
        .first()
        .isVisible()
        .catch(() => false);
    }

    if (stillOnSignup) {
      const postErrors = await this.page
        .locator(
          ".ant-modal p, .ant-modal span, .ant-modal div[class*='error'], .ant-modal [class*='text-red'], [class*='error'], [class*='text-red']",
        )
        .allTextContents()
        .catch(() => [] as string[]);
      const nonEmptyErrors = postErrors
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length < 300);
      console.log(
        `[SignupPage] Still on signup after submit. Visible text: ${nonEmptyErrors.slice(0, 12).join(" | ")}`,
      );
    }
  }

  /** Verify we've reached a booking confirmation / success state. */
  async isBookingConfirmed(): Promise<boolean> {
    await this.page.waitForTimeout(2000);
    const indicators = [
      'text="Booking confirmed"',
      'text="Appointment confirmed"',
      'text="Thank you"',
      'text="Successfully booked"',
      'text="Your appointment"',
      '[class*="success"]',
      '[class*="confirmation"]',
    ];
    for (const sel of indicators) {
      if (
        await this.page
          .locator(sel)
          .isVisible()
          .catch(() => false)
      ) {
        return true;
      }
    }
    return false;
  }
}
