import { Page } from "@playwright/test";

export class GuestContinuePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async continueAsGuestIfVisible(): Promise<boolean> {
    const guestButton = this.page
      .locator(
        'button:has-text("Continue as Guest"), :text("Continue as Guest")',
      )
      .first();

    const visible = await guestButton
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (!visible) {
      return false;
    }

    await guestButton.scrollIntoViewIfNeeded().catch(() => {});
    await guestButton.click({ force: true, timeout: 5_000 }).catch(async () => {
      await guestButton.evaluate((el: HTMLElement) => el.click());
    });
    await this.page.waitForLoadState("networkidle").catch(() => {});
    return true;
  }
}
