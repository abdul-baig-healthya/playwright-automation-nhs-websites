import { Page } from "@playwright/test";

export class BookingPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Wait for the booking page to be ready.
   * Detects the appointment type selector, slot picker, or instant "Book Now" button.
   */
  async waitForPage() {
    await this.page.waitForLoadState("domcontentloaded");
    await this.page
      .locator(
        [
          ".appointment-type-radio-group",
          ':text("Appointment type")',
          ':text("Book your appointment")',
          ':text("Schedule your appointment")',
          ".rota-slot",
          'button:has-text("Book Now")',
        ].join(", ")
      )
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
  }

  /**
   * Select the first available appointment session type
   * (e.g. Phone, Video, Face-to-face).
   */
  async selectFirstSessionType() {
    const radioGroup = this.page.locator(".appointment-type-radio-group");
    if (!(await radioGroup.isVisible({ timeout: 5_000 }).catch(() => false))) {
      return;
    }

    const firstRadio = radioGroup
      .locator(".ant-radio-wrapper, .ant-radio-button-wrapper, label")
      .first();
    await firstRadio.click();
    await this.page.waitForTimeout(1500);
  }

  /**
   * Try to book an instant slot using the "Book Now" button.
   * Returns true if the button was found, enabled, and clicked.
   */
  async clickBookNow(): Promise<boolean> {
    const bookNowBtn = this.page
      .locator(
        'button.button-primary:has-text("Book Now"), button:has-text("Book Now")'
      )
      .first();

    if (!(await bookNowBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      return false;
    }
    const isDisabled = await bookNowBtn.isDisabled().catch(() => true);
    if (isDisabled) return false;

    await bookNowBtn.click();
    await this.page.waitForTimeout(2000);
    return true;
  }

  /**
   * Select the first available (non-disabled) date in the WeeklyDatePicker.
   * Navigates up to 8 weeks forward if the current week has no enabled dates.
   * Returns true if a date was selected.
   *
   * The WeeklyDatePicker renders cells as div[class] elements inside a
   * grid-cols-7 layout. Enabled cells have "cursor-pointer" in className
   * and do NOT have "cursor-not-allowed". Disabled have "[#C6C6C6]" text color.
   */
  async selectFirstEnabledDate(): Promise<boolean> {
    for (let weekAttempt = 0; weekAttempt < 8; weekAttempt++) {
      await this.page.waitForTimeout(800);

      const clicked = await this.page.evaluate((): boolean => {
        const allDivs = Array.from(
          document.querySelectorAll("div[class]")
        ) as HTMLElement[];

        for (const div of allDivs) {
          const cls = div.className;
          if (
            cls.includes("flex-col") &&
            cls.includes("items-center") &&
            cls.includes("cursor-pointer") &&
            !cls.includes("cursor-not-allowed") &&
            div.children.length >= 2
          ) {
            // Confirm the cell contains a date-like text (number + abbreviated month)
            const text = (div.textContent ?? "").replace(/\s+/g, "");
            if (/^\d{1,2}[A-Za-z]{3}$/.test(text)) {
              div.click();
              return true;
            }
          }
        }
        return false;
      });

      if (clicked) {
        await this.page.waitForTimeout(1500);
        return true;
      }

      // No available dates this week — try navigating to next week
      const navigated = await this.navigateNextWeek();
      if (!navigated) break;
    }
    return false;
  }

  /**
   * Click the "next week" navigation button in the WeeklyDatePicker.
   * The nav buttons are borderered icon-only buttons (min-w-[38px] style).
   */
  private async navigateNextWeek(): Promise<boolean> {
    const clicked = await this.page.evaluate((): boolean => {
      const buttons = Array.from(
        document.querySelectorAll("button[class]")
      ) as HTMLButtonElement[];

      const navButtons = buttons.filter((btn) => {
        const cls = btn.className;
        return (
          cls.includes("items-center") &&
          cls.includes("justify-center") &&
          cls.includes("border-solid") &&
          !btn.disabled
        );
      });

      if (navButtons.length >= 2) {
        (navButtons[1] as HTMLButtonElement).click();
        return true;
      }
      if (navButtons.length === 1) {
        (navButtons[0] as HTMLButtonElement).click();
        return true;
      }
      return false;
    });

    if (clicked) await this.page.waitForTimeout(1000);
    return clicked;
  }

  /**
   * Select the first available (non-disabled) time slot from the rota-slot group.
   * Slots are rendered as label.ant-radio-button-wrapper elements.
   * Returns true if a slot was selected.
   */
  async selectFirstAvailableSlot(): Promise<boolean> {
    const slotGroup = this.page.locator(".rota-slot");
    if (!(await slotGroup.isVisible({ timeout: 10_000 }).catch(() => false))) {
      return false;
    }

    const slotLabels = slotGroup.locator("label.ant-radio-button-wrapper");
    const count = await slotLabels.count();
    if (count === 0) return false;

    for (let i = 0; i < count; i++) {
      const slot = slotLabels.nth(i);
      const isDisabled = await slot
        .evaluate((el) =>
          el.classList.contains("ant-radio-button-wrapper-disabled")
        )
        .catch(() => true);
      if (!isDisabled) {
        await slot.click();
        await this.page.waitForTimeout(500);
        return true;
      }
    }
    return false;
  }

  /**
   * Click the "Book Appointment" button. Waits for it to become enabled
   * (requires a slot to be selected first).
   */
  async clickBookAppointment() {
    const preferredCtas = this.page.locator(
      [
        'button:has-text("Continue to Payment")',
        'button:has-text("Continue to payment")',
        'button:has-text("Continue To Payment")',
        'button:has-text("Book Appointment")',
        'button:has-text("Confirm Appointment")',
        'button:has-text("Continue")',
        'button:has-text("Next")',
        'button:has-text("Proceed")',
        'button:has-text("Book")',
        'button[type="submit"]',
      ].join(", "),
    );

    // Wait for booking CTA to become enabled after slot selection.
    for (let i = 0; i < 8; i++) {
      const count = await preferredCtas.count();
      for (let idx = 0; idx < count; idx++) {
        const btn = preferredCtas.nth(idx);
        const visible = await btn.isVisible({ timeout: 300 }).catch(() => false);
        if (!visible) continue;

        const enabled = await btn.isEnabled().catch(() => false);
        const text = ((await btn.textContent().catch(() => "")) ?? "").trim();
        console.log(
          `[BookingPage] Booking button candidate -> text="${text}", enabled=${enabled}`,
        );
        if (!enabled) continue;

        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await btn.click({ force: true });
        await this.page.waitForTimeout(1500);
        return;
      }
      await this.page.waitForTimeout(700);
    }

    const clickedFallback = await this.page.evaluate((): string | null => {
      const buttons = Array.from(
        document.querySelectorAll("button"),
      ) as HTMLButtonElement[];

      const preferred = buttons.find((button) => {
        const text = (button.textContent ?? "").trim().toLowerCase();
        return (
          !button.disabled &&
          (text.includes("book") ||
            text.includes("confirm") ||
            text.includes("continue") ||
            text.includes("next") ||
            text.includes("proceed"))
        );
      });

      if (preferred) {
        preferred.click();
        return (preferred.textContent ?? "").trim();
      }

      return null;
    });

    if (clickedFallback) {
      console.log(
        `[BookingPage] Clicked fallback booking button with text "${clickedFallback}"`,
      );
      await this.page.waitForTimeout(1500);
      return;
    }

    const visibleButtons = await this.page
      .locator("button")
      .evaluateAll((buttons) =>
        buttons.map((button) => ({
          text: (button.textContent ?? "").trim(),
          disabled: (button as HTMLButtonElement).disabled,
          className: (button as HTMLElement).className || "",
        })),
      )
      .catch(() => [] as Array<{
        text: string;
        disabled: boolean;
        className: string;
      }>);
    console.log(
      `[BookingPage] No booking CTA found after slot selection. Buttons: ${JSON.stringify(visibleButtons.slice(0, 12))}`,
    );
  }

  /**
   * Handle the "Appointment Selected" / intermediate "Continue" state.
   * After a booking is made, the app may show a sticky "Continue" button
   * before transitioning to the next journey step.
   * Returns true if handled.
   */
  async handleBookingContinue(): Promise<boolean> {
    const continueBtn = this.page
      .locator('button:has-text("Continue")')
      .first();

    if (
      await continueBtn.isVisible({ timeout: 5_000 }).catch(() => false)
    ) {
      await continueBtn.click();
      await this.page.waitForTimeout(1500);
      return true;
    }
    return false;
  }

  /**
   * Check whether the current page is a booking step.
   */
  async isBookingPage(): Promise<boolean> {
    const indicators = [
      ".appointment-type-radio-group",
      ".rota-slot",
      'button:has-text("Book Now")',
      'button:has-text("Continue to Payment")',
      'button:has-text("Continue to payment")',
      'button:has-text("Continue To Payment")',
      'button:has-text("Continue to Payement")',
      ':text("Appointment type")',
    ];
    for (const sel of indicators) {
      if (
        await this.page.locator(sel).isVisible({ timeout: 500 }).catch(() => false)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Complete the full booking flow:
   *   1. Select session type
   *   2. Try instant "Book Now" → fall back to date + slot selection
   *   3. Handle any intermediate "Continue" state
   */
  async completeBooking() {
    await this.waitForPage();
    await this.selectFirstSessionType();

    // Brief pause for any dynamic content to load after session type selection
    await this.page.waitForTimeout(2000);

    // Attempt instant "Book Now" path (simplest)
    const bookedInstant = await this.clickBookNow();
    if (bookedInstant) {
      console.log("✔ Booked via instant Book Now slot");
      await this.handleBookingContinue();
      return;
    }

    // Fall back: select a date, then a time slot
    console.log("ℹ No instant slot — selecting date and time slot");
    const dateSelected = await this.selectFirstEnabledDate();
    if (!dateSelected) {
      console.log("⚠ No available dates found in next 8 weeks");
      return;
    }

    const slotSelected = await this.selectFirstAvailableSlot();
    if (!slotSelected) {
      console.log("⚠ No available slots found for selected date");
      return;
    }

    await this.clickBookAppointment();
    await this.handleBookingContinue();
  }
}
