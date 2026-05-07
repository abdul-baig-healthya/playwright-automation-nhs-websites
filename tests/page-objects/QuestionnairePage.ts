import { Page } from "@playwright/test";
import { getActiveConditionName } from "../fixtures/test-data";
import {
  SHINGLES_RULES,
  WEIGHT_MANAGEMENT_RULES,
} from "./ConditionQuestionnaireRules";

/**
 * Handles the dynamic questionnaire wizard.
 * Questions are loaded one at a time; we detect the type and answer accordingly.
 */
export class QuestionnairePage {
  readonly page: Page;
  private readonly MAX_QUESTIONS = 50;
  private readonly answeredRuleKeys = new Set<string>();
  private conditionRuleCursor = 0;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Wait for the questionnaire page to be ready.
   */
  async waitForPage() {
    await this.page.waitForLoadState("domcontentloaded");
    // Wait for at least one question or the first navigation button
    await this.page
      .locator(
        [
          ':text("Questionnaires")',
          ':text("Do you have these symptoms?")',
          ':text("I do not have these symptoms")',
          ".question-container",
          '[class*="question"]',
          'button:has-text("Save")',
          'button:has-text("Next")',
          'button:has-text("Continue")',
          'button:has-text("Submit")',
          // Signup form may appear directly after questionnaire in some flows
          'input[name="first_name"]',
        ].join(", "),
      )
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
  }

  /**
   * Walk through all questionnaire steps until the signup/booking page appears.
   * For each question detected:
   *  - Single choice (radio) → select first option
   *  - Checkbox group → check first option
   *  - Text/textarea → type a generic answer
   *  - Number → type "70"
   *  - Date → fill with test DOB
   * Then click Next/Continue/Submit.
   */
  async answerAllQuestions() {
    for (let step = 0; step < this.MAX_QUESTIONS; step++) {
      await this.page.waitForTimeout(800); // brief pause for animations

      // Guard: once payment is visible, stop questionnaire handling immediately.
      if (await this.isOnPaymentPage()) {
        console.log(
          "[QuestionnairePage] Payment UI detected — exiting questionnaire handler",
        );
        return;
      }

      // If we've reached the signup form, stop
      if (await this.isOnSignupOrBookingPage()) {
        return;
      }

      const answered = await this.answerCurrentQuestion();
      const advanced = await this.progressQuestionnaire();

      if (!advanced && !answered) {
        // No question found and no button — might be loading or done
        await this.page.waitForTimeout(1500);
        if (await this.isOnSignupOrBookingPage()) return;
      }
    }
  }

  private async clickPreferredOption(
    wrappers: ReturnType<Page["locator"]>,
    patterns: RegExp[],
  ): Promise<boolean> {
    const count = await wrappers.count();
    if (count === 0) return false;

    for (const pattern of patterns) {
      const match = wrappers.filter({ hasText: pattern });
      if ((await match.count()) > 0) {
        await match.first().click();
        return true;
      }
    }

    await wrappers.last().click();
    return true;
  }

  /**
   * For single-choice (radio) questions, prefer the safest negative answer if
   * available, including the exact "I do not have these symptoms" wording.
   */
  private async clickBestRadioOption(
    wrappers: ReturnType<Page["locator"]>,
  ): Promise<boolean> {
    const enabledWrappers = wrappers.filter({
      hasNot: this.page.locator(
        ".ant-radio-wrapper-disabled, .ant-radio-button-wrapper-disabled, [aria-disabled='true']",
      ),
    });
    return this.clickPreferredOption(enabledWrappers, [
      /^I do not have these symptoms$/i,
      /do not have these symptoms/i,
      /do not have/i,
      /^No$/i,
      /None of the above/i,
      /None apply/i,
      /^None$/i,
    ]);
  }

  private async isRadioSelectionApplied(labelText: string): Promise<boolean> {
    const selectedInput = this.page
      .locator(
        [
          `label:has-text("${labelText}") input[type="radio"]`,
          `input[type="radio"][value="${labelText}"]`,
        ].join(", "),
      )
      .first();

    if (await selectedInput.count()) {
      const checked = await selectedInput
        .evaluate((el: HTMLInputElement) => el.checked)
        .catch(() => false);
      if (checked) return true;
    }

    const ariaRadio = this.page
      .locator(`[role="radio"]:has-text("${labelText}")`)
      .first();
    if (await ariaRadio.count()) {
      return await ariaRadio
        .evaluate((el) => el.getAttribute("aria-checked") === "true")
        .catch(() => false);
    }

    const antWrapper = this.page
      .locator(
        [
          `.ant-radio-wrapper:has-text("${labelText}")`,
          `.ant-radio-button-wrapper:has-text("${labelText}")`,
        ].join(", "),
      )
      .first();
    if (await antWrapper.count()) {
      return await antWrapper
        .evaluate(
          (el) =>
            el.classList.contains("ant-radio-wrapper-checked") ||
            el.classList.contains("ant-radio-button-wrapper-checked"),
        )
        .catch(() => false);
    }

    return false;
  }

  private async selectRadioByText(
    labelText: string,
    customScope?: ReturnType<Page["locator"]>,
  ): Promise<boolean> {
    const scope = customScope ?? this.page;
    const possibleInputs = [
      `label:has-text("${labelText}") input[type="radio"]`,
      `input[type="radio"][value="${labelText}"]`,
      `input[type="radio"][aria-label="${labelText}"]`,
    ];

    const radioInput = scope.locator(possibleInputs.join(", ")).first();
    if (await radioInput.count()) {
      await radioInput.scrollIntoViewIfNeeded().catch(() => {});
      try {
        await radioInput.check({ force: true });
      } catch {
        await radioInput.evaluate((el: HTMLInputElement) => {
          el.checked = true;
          el.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true }),
          );
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new Event("input", { bubbles: true }));
        });
      }
      await this.page.waitForTimeout(300);
      const checked = await radioInput
        .evaluate((el: HTMLInputElement) => el.checked)
        .catch(() => false);
      console.log(`[QuestionnairePage] Radio checked via input: ${checked}`);
      if (checked) return true;
    }

    const clickTargets = [
      `label:has-text("${labelText}")`,
      `[role="radio"]:has-text("${labelText}")`,
      `.ant-radio-wrapper:has-text("${labelText}")`,
      `.ant-radio-button-wrapper:has-text("${labelText}")`,
      `div:has-text("${labelText}")`,
    ];

    for (const selector of clickTargets) {
      const option = scope.locator(selector).first();
      if (!(await option.isVisible().catch(() => false))) continue;
      const disabled = await option
        .evaluate((el) => {
          const htmlEl = el as HTMLElement;
          return (
            htmlEl.className.includes("disabled") ||
            htmlEl.getAttribute("aria-disabled") === "true"
          );
        })
        .catch(() => false);
      if (disabled) continue;

      await option.scrollIntoViewIfNeeded().catch(() => {});
      await option.click({ force: true }).catch(async () => {
        await option.evaluate((el: HTMLElement) => el.click());
      });
      await this.page.waitForTimeout(300);

      const selected = await this.isRadioSelectionApplied(labelText);
      console.log(
        `[QuestionnairePage] Radio checked after click on ${selector}: ${selected}`,
      );
      if (selected) return true;
    }

    return false;
  }

  private async selectCheckboxByText(
    labelText: string,
    customScope?: ReturnType<Page["locator"]>,
  ): Promise<boolean> {
    const scope = customScope ?? this.getActiveQuestionScope();
    const possibleInputs = [
      `label:has-text("${labelText}") input[type="checkbox"]`,
      `input[type="checkbox"][value="${labelText}"]`,
      `input[type="checkbox"][aria-label="${labelText}"]`,
    ];

    const checkboxInput = scope.locator(possibleInputs.join(", ")).first();
    if (await checkboxInput.count()) {
      await checkboxInput.scrollIntoViewIfNeeded().catch(() => {});
      const checked = await checkboxInput.isChecked().catch(() => false);
      if (!checked) {
        await checkboxInput.check({ force: true }).catch(async () => {
          await checkboxInput.evaluate((el: HTMLInputElement) => {
            el.checked = true;
            el.dispatchEvent(
              new MouseEvent("click", { bubbles: true, cancelable: true }),
            );
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.dispatchEvent(new Event("input", { bubbles: true }));
          });
        });
      }
      const finalChecked = await checkboxInput.isChecked().catch(() => false);
      console.log(
        `[QuestionnairePage] Checkbox "${labelText}" checked via input: ${finalChecked}`,
      );
      if (finalChecked) {
        const visibleUiChecked = await scope
          .locator(
            [
              `.ant-checkbox-wrapper-checked:has-text("${labelText}")`,
              `[role="checkbox"][aria-checked="true"]:has-text("${labelText}")`,
              `label:has-text("${labelText}") .ant-checkbox-input:checked`,
            ].join(", "),
          )
          .first()
          .isVisible({ timeout: 300 })
          .catch(() => false);
        if (visibleUiChecked) return true;
      }
    }

    // FIX 2: Removed generic `div:has-text("${labelText}")` from clickTargets
    // — it was too broad and matched Ant Design radio wrappers, causing both
    // checkbox and radio handlers to fire on the same render (the flicker).
    const clickTargets = [
      `label:has-text("${labelText}")`,
      `[role="checkbox"]:has-text("${labelText}")`,
      `.ant-checkbox-wrapper:has-text("${labelText}")`,
    ];

    for (const selector of clickTargets) {
      const option = scope.locator(selector).first();
      if (!(await option.isVisible().catch(() => false))) continue;

      // Prefer clicking the actual checkbox control in this option row.
      const checkboxControl = option
        .locator(
          ".ant-checkbox-inner, .ant-checkbox-input, input[type='checkbox']",
        )
        .first();
      if (await checkboxControl.isVisible().catch(() => false)) {
        await checkboxControl.scrollIntoViewIfNeeded().catch(() => {});
        await checkboxControl.click({ force: true }).catch(async () => {
          await checkboxControl.evaluate((el: HTMLElement) => el.click());
        });
      } else {
        await option.scrollIntoViewIfNeeded().catch(() => {});
        await option.click({ force: true }).catch(async () => {
          await option.evaluate((el: HTMLElement) => el.click());
        });
      }

      // FIX 1: Increased settle wait from 250ms to 500ms so Ant Design's
      // internal state is committed before we return and the next handler runs.
      await this.page.waitForTimeout(500);
      const visibleUiChecked = await scope
        .locator(
          [
            `.ant-checkbox-wrapper-checked:has-text("${labelText}")`,
            `[role="checkbox"][aria-checked="true"]:has-text("${labelText}")`,
            `label:has-text("${labelText}") .ant-checkbox-input:checked`,
          ].join(", "),
        )
        .first()
        .isVisible({ timeout: 300 })
        .catch(() => false);
      if (!visibleUiChecked) continue;
      console.log(
        `[QuestionnairePage] Clicked checkbox option "${labelText}" via ${selector}`,
      );
      return true;
    }

    const partialTargets = [
      /None of the above/i,
      /Unexplained\s*weight\s*loss/i,
      /Presentation\s*>?\s*7\s*days\s*after\s*rash\s*onset/i,
      /outside antiviral treatment window/i,
    ];

    for (const pattern of partialTargets) {
      if (!pattern.test(labelText)) continue;

      const partialOption = scope
        .locator('label, [role="checkbox"], .ant-checkbox-wrapper')
        .filter({ hasText: pattern })
        .first();

      if (!(await partialOption.isVisible().catch(() => false))) continue;

      const checkboxControl = partialOption
        .locator(
          ".ant-checkbox-inner, .ant-checkbox-input, input[type='checkbox']",
        )
        .first();
      if (await checkboxControl.isVisible().catch(() => false)) {
        await checkboxControl.scrollIntoViewIfNeeded().catch(() => {});
        await checkboxControl.click({ force: true }).catch(async () => {
          await checkboxControl.evaluate((el: HTMLElement) => el.click());
        });
      } else {
        await partialOption.scrollIntoViewIfNeeded().catch(() => {});
        await partialOption.click({ force: true }).catch(async () => {
          await partialOption.evaluate((el: HTMLElement) => el.click());
        });
      }
      // FIX 1: Consistent settle wait here too — and removed generic `div`
      // from the locator above to avoid matching radio wrappers.
      await this.page.waitForTimeout(500);
      const visibleUiChecked = await scope
        .locator(
          [
            `.ant-checkbox-wrapper-checked:has-text("${labelText}")`,
            `[role="checkbox"][aria-checked="true"]:has-text("${labelText}")`,
            `label:has-text("${labelText}") .ant-checkbox-input:checked`,
          ].join(", "),
        )
        .first()
        .isVisible({ timeout: 300 })
        .catch(() => false);
      if (!visibleUiChecked) continue;
      console.log(
        `[QuestionnairePage] Clicked checkbox option "${labelText}" via partial text match`,
      );
      return true;
    }

    return false;
  }

  private async selectCheckboxByTextFlexible(
    labelText: string,
    customScope?: ReturnType<Page["locator"]>,
  ): Promise<boolean> {
    const exact = await this.selectCheckboxByText(labelText, customScope);
    if (exact) return true;

    const normalized = labelText.replace(/\s+/g, "\\s*");
    const pattern = new RegExp(normalized, "i");
    const scope = customScope ?? this.getActiveQuestionScope();

    if (/^none of the above$/i.test(labelText.trim())) {
      const exactNoneCandidates = scope
        .locator(
          [
            "label",
            '[role="checkbox"]',
            ".ant-checkbox-wrapper",
            "div",
            "span",
          ].join(", "),
        )
        .filter({ hasText: /^None of the above$/i });
      const exactCount = await exactNoneCandidates.count().catch(() => 0);
      for (let i = exactCount - 1; i >= 0; i--) {
        const option = exactNoneCandidates.nth(i);
        const visible = await option.isVisible().catch(() => false);
        if (!visible) continue;
        await option.scrollIntoViewIfNeeded().catch(() => {});
        await option.click({ force: true }).catch(async () => {
          await option.evaluate((el: HTMLElement) => el.click());
        });
        await this.page.waitForTimeout(350);
        return true;
      }
    }

    const candidates = scope
      .locator(
        [
          "label",
          '[role="checkbox"]',
          ".ant-checkbox-wrapper",
          ".ant-radio-wrapper",
          ".ant-radio-button-wrapper",
          "div",
          "span",
        ].join(", "),
      )
      .filter({ hasText: pattern });

    const count = await candidates.count().catch(() => 0);
    for (let i = count - 1; i >= 0; i--) {
      const option = candidates.nth(i);
      if (!(await option.isVisible().catch(() => false))) continue;
      const isDisabled = await option
        .evaluate((el) => {
          const htmlEl = el as HTMLElement;
          const ariaDisabled = htmlEl.getAttribute("aria-disabled") === "true";
          const classDisabled =
            htmlEl.className.includes("disabled") ||
            htmlEl.className.includes("not-allowed");
          const input = htmlEl.querySelector("input") as
            | HTMLInputElement
            | undefined;
          const inputDisabled = input ? input.disabled : false;
          return ariaDisabled || classDisabled || inputDisabled;
        })
        .catch(() => false);
      if (isDisabled) continue;

      await option.scrollIntoViewIfNeeded().catch(() => {});
      await option.click({ force: true }).catch(async () => {
        await option.evaluate((el: HTMLElement) => el.click());
      });
      await this.page.waitForTimeout(350);
      return true;
    }

    return false;
  }

  private getActiveQuestionScope() {
    return this.page
      .locator(
        [
          ".question-container:visible",
          '[class*="question"]:visible',
          'form:has(input[type="radio"]):visible',
          'form:has(input[type="checkbox"]):visible',
        ].join(", "),
      )
      .first();
  }

  private getQuestionScopeForRule(pattern: RegExp) {
    const active = this.getActiveQuestionScope();
    return active.filter({ hasText: pattern }).first();
  }

  private fuzzyRuleMatch(questionText: string, pattern: RegExp): boolean {
    if (pattern.test(questionText)) return true;

    const raw = pattern.source
      .replace(/\\\?/g, "?")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\.\*/g, " ")
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .toLowerCase();

    const tokens = raw
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 4)
      .filter(
        (t) =>
          !["select", "apply", "that", "these", "have", "your"].includes(t),
      );

    if (tokens.length === 0) return false;
    const text = questionText.toLowerCase();
    const hits = tokens.filter((t) => text.includes(t)).length;
    return hits >= Math.max(2, Math.floor(tokens.length * 0.5));
  }

  private async answerCurrentQuestion(): Promise<boolean> {
    const activeCondition = getActiveConditionName().toLowerCase();
    const handledByConditionRule = await this.answerByConditionRules();
    if (handledByConditionRule) {
      return true;
    }

    // For weight-management we keep questionnaire strictly rule-driven to avoid
    // falling into generic shingles-style radio fallbacks on disabled options.
    if (activeCondition === "weight management") {
      return false;
    }

    const hasShinglesSymptomsQuestion = await this.page
      .locator(
        ':text("Do you have any of below symptoms. Check all that apply")',
      )
      .first()
      .isVisible()
      .catch(() => false);
    const hasShinglesChecklistQuestion = await this.page
      .locator(':text("Please check all that apply to you.")')
      .first()
      .isVisible()
      .catch(() => false);

    if (hasShinglesSymptomsQuestion || hasShinglesChecklistQuestion) {
      let handled = false;

      if (hasShinglesSymptomsQuestion) {
        const noneOfTheAboveSelected =
          await this.selectCheckboxByText("None of the above");
        handled = noneOfTheAboveSelected || handled;
      }

      if (hasShinglesChecklistQuestion) {
        const presentationSelected = await this.selectCheckboxByText(
          "Presentation >7 days after rash onset (outside antiviral treatment window)",
        );
        handled = presentationSelected || handled;
      }

      // FIX 3: Always return here unconditionally — success or not — so the
      // radio fallback logic below never fires on the same render cycle.
      // Previously `if (handled) return true` allowed fall-through when both
      // checkbox attempts failed, causing radio handlers to pick up Ant Design
      // radio wrappers and produce the visible flicker. If checkboxes genuinely
      // couldn't be found, answerAllQuestions will retry on the next iteration
      // with a clean slate instead of firing conflicting handlers immediately.
      console.log(
        `[QuestionnairePage] Shingles block handled=${handled}, returning early`,
      );
      return handled;
    }

    const noSymptomsSelected = await this.selectRadioByText(
      "I do not have these symptoms",
    );
    if (noSymptomsSelected) {
      console.log(
        '[QuestionnairePage] Selected "I do not have these symptoms"',
      );
      return true;
    }

    // Single choice (radio buttons)
    const radios = this.page.locator(
      'input[type="radio"]:not([name="gender"]):not([id="male"]):not([id="female"])',
    );
    if ((await radios.count()) > 0) {
      const optionSelectors = [
        '.ant-radio-wrapper:has-text("I do not have these symptoms")',
        '.ant-radio-button-wrapper:has-text("I do not have these symptoms")',
        'label:has-text("I do not have these symptoms")',
        "text=/I do not have.*these symptoms/i",
        "text=/do not have these symptoms/i",
        "text=/^No$/i",
      ];
      for (const selector of optionSelectors) {
        const option = this.page.locator(selector).first();
        if (await option.isVisible().catch(() => false)) {
          await option.click({ force: true });
          await this.page.waitForTimeout(300);
          const noSymptomsChecked = await this.isRadioSelectionApplied(
            "I do not have these symptoms",
          );
          if (noSymptomsChecked) return true;
        }
      }

      const radioLabels = this.page
        .locator('label:has(input[type="radio"])')
        .filter({
          hasText: /I do not have these symptoms|do not have|^No$/i,
          hasNot: this.page.locator(
            ".ant-radio-wrapper-disabled, .ant-radio-button-wrapper-disabled",
          ),
        });
      if ((await radioLabels.count()) > 0) {
        await radioLabels.first().click();
        await this.page.waitForTimeout(300);
        const noSymptomsChecked = await this.isRadioSelectionApplied(
          "I do not have these symptoms",
        );
        if (noSymptomsChecked) return true;
      }

      const radioCount = await radios.count();
      if (radioCount > 0) {
        const fallbackRadio = radios.nth(radioCount - 1);
        const isVisible = await fallbackRadio.isVisible().catch(() => false);
        if (isVisible) {
          await fallbackRadio.click({ force: true }).catch(() => {});
          return true;
        }
      }
      return false;
    }

    // Ant Design radio group — prefer "No", fallback to last option
    const antRadioWrappers = this.page.locator(".ant-radio-wrapper");
    if ((await antRadioWrappers.count()) > 0) {
      return await this.clickBestRadioOption(antRadioWrappers);
    }

    // Ant Design radio button style (ant-radio-button-wrapper)
    const antRadioButtons = this.page.locator(".ant-radio-button-wrapper");
    if ((await antRadioButtons.count()) > 0) {
      return await this.clickBestRadioOption(antRadioButtons);
    }

    // check_agree — must check the checkbox to agree/consent
    const agreeCheckbox = this.page.locator('input[type="checkbox"]');
    if ((await agreeCheckbox.count()) > 0) {
      // For "none of the above" style, check first; for agree checkboxes, check all
      const noneOption = this.page
        .locator('label:has(input[type="checkbox"])')
        .filter({ hasText: /none|n\/a/i });
      if ((await noneOption.count()) > 0) {
        await noneOption.first().click();
      } else {
        await agreeCheckbox.first().check({ force: true });
      }
      return true;
    }

    // Numerical input — detect context (height vs weight vs generic)
    const numberInput = this.page.locator(
      'input[type="number"], input[inputmode="numeric"]',
    );
    if (await numberInput.isVisible().catch(() => false)) {
      const count = await numberInput.count();
      if (count >= 2) {
        // Likely height + weight fields together (health_data_point)
        // First = height (cm), second = weight (kg)
        await numberInput.nth(0).click();
        await numberInput.nth(0).fill("170");
        await numberInput.nth(1).click();
        await numberInput.nth(1).fill("70");
      } else {
        // Check surrounding label text to pick appropriate value
        const pageText = await this.page.textContent("body").catch(() => "");
        if (/height|cm/i.test(pageText ?? "")) {
          await numberInput.first().fill("170");
        } else if (/weight|kg/i.test(pageText ?? "")) {
          await numberInput.first().fill("70");
        } else {
          await numberInput.first().fill("70");
        }
      }
      return true;
    }

    // Text / textarea
    const textInput = this.page.locator(
      'input[type="text"]:not([name="first_name"]):not([name="last_name"]):not([name="postcode"]), textarea',
    );
    if (await textInput.isVisible().catch(() => false)) {
      await textInput.first().click();
      await textInput.first().clear();
      await textInput.first().fill("None");
      return true;
    }

    // Date picker (Ant Design) — look for ant-picker
    const datePicker = this.page.locator(".ant-picker input").first();
    if (await datePicker.isVisible().catch(() => false)) {
      await datePicker.click();
      await datePicker.fill("1990-01-01");
      // Press Enter to confirm date selection
      await this.page.keyboard.press("Enter");
      return true;
    }

    return false;
  }

  private async answerByConditionRules(): Promise<boolean> {
    const activeCondition = getActiveConditionName().toLowerCase();
    const rules =
      activeCondition === "weight management"
        ? WEIGHT_MANAGEMENT_RULES
        : activeCondition === "shingles"
          ? SHINGLES_RULES
          : [];
    if (rules.length === 0) return false;

    // Strict sequence mode: answer exactly one expected rule at a time.
    const expectedRule = rules[this.conditionRuleCursor];
    if (!expectedRule) return false;
    const expectedKey = `${expectedRule.questionPattern.source}__${expectedRule.answerText}`;
    const scope = this.getQuestionScopeForRule(expectedRule.questionPattern);
    const scopeText =
      (await scope.textContent().catch(async () => {
        return (await this.page.textContent("body").catch(() => "")) ?? "";
      })) ?? "";

    const matchedExpected =
      expectedRule.questionPattern.test(scopeText) ||
      this.fuzzyRuleMatch(scopeText, expectedRule.questionPattern);

    if (matchedExpected) {
      console.log(
        `[QuestionnairePage] Sequence rule ${this.conditionRuleCursor + 1}/${rules.length} matched: ${expectedRule.questionPattern}`,
      );
      const answered =
        expectedRule.control === "checkbox"
          ? await this.selectCheckboxByTextFlexible(
              expectedRule.answerText,
              scope,
            )
          : await this.selectRadioByText(expectedRule.answerText, scope);

      if (answered) {
        this.answeredRuleKeys.add(expectedKey);
        this.conditionRuleCursor += 1;
        const prevText = scopeText.slice(0, 400);
        await this.clickPrimaryButton().catch(() => false);
        await this.page.waitForTimeout(700);
        await this.page
          .waitForFunction(
            ({ oldText }) => {
              const el =
                document.querySelector(".question-container") ||
                document.querySelector('[class*="question"]');
              const txt = (
                el?.textContent ||
                document.body.textContent ||
                ""
              ).slice(0, 400);
              return txt !== oldText;
            },
            { oldText: prevText },
            { timeout: 4000 },
          )
          .catch(() => {});
        return true;
      }
      // matched but not selected; stop here to avoid flickering fallback clicks
      return true;
    }

    return false;
  }

  private async clickPrimaryButton(): Promise<boolean> {
    const buttonSelectors = [
      'button:has-text("Confirm")',
      'button:has-text("Save")',
      'input[type="submit"][value="Confirm"]',
      'input[type="submit"][value="Save"]',
      'input[type="button"][value="Confirm"]',
      'input[type="button"][value="Save"]',
      'button:has-text("Next")',
      'button:has-text("Continue")',
      'button:has-text("Submit")',
      'button:has-text("Finish")',
      'button[type="submit"]',
    ];

    for (const sel of buttonSelectors) {
      const btn = this.page.locator(sel).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ force: true });
        return true;
      }
    }
    return false;
  }

  /**
   * Some questionnaire flows require multiple consecutive actions:
   * Save -> Confirm -> NHS111 popup -> Book Private Consultation.
   * Keep clicking the currently visible primary action until the page moves on
   * or the popup CTA is handled.
   */
  private async progressQuestionnaire(): Promise<boolean> {
    let progressed = false;

    for (let attempt = 0; attempt < 5; attempt++) {
      if (await this.isOnPaymentPage()) {
        return true;
      }

      const handledNHS111 = await this.handleNHS111Popup();
      if (handledNHS111) {
        return true;
      }

      if (await this.isOnSignupOrBookingPage()) {
        return true;
      }

      const clicked = await this.clickPrimaryButton();
      if (!clicked) {
        return progressed;
      }

      progressed = true;
      await this.page.waitForTimeout(1200);
    }

    return progressed;
  }

  /**
   * Returns true if the current page looks like a questionnaire (has question UI elements).
   * Used by the spec to decide whether to run the questionnaire step.
   */
  async isOnQuestionnairePage(): Promise<boolean> {
    const questionnaireIndicators = [
      ".question-container",
      '[class*="question"]',
      '[class*="questionnaire"]',
      'button:has-text("Next")',
    ];
    for (const sel of questionnaireIndicators) {
      if (
        await this.page
          .locator(sel)
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        return true;
      }
    }
    return false;
  }

  private async isOnSignupOrBookingPage(): Promise<boolean> {
    const signupIndicators = [
      'input[name="first_name"]',
      'input[name="last_name"]',
      'text="Create Account"',
      'text="Sign Up"',
      'text="Book Appointment"',
      'text="Your appointment"',
      '[class*="booking"]',
      '[class*="signup"]',
    ];

    for (const sel of signupIndicators) {
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

  private async handleNHS111Popup(): Promise<boolean> {
    if (await this.isOnPaymentPage()) {
      return false;
    }

    const popupRoot = this.page
      .locator(
        [
          '.ant-modal-content:has-text("NHS 111")',
          '[role="dialog"]:has-text("NHS 111")',
          ':text("Need Faster Access to Care?")',
        ].join(", "),
      )
      .first();

    const popupVisible = await popupRoot.isVisible().catch(() => false);
    const popupButton = this.page
      .locator(
        'button:has-text("Book Private Consultation"), a:has-text("Book Private Consultation")',
      )
      .first();

    if (
      !popupVisible &&
      !(await popupButton.isVisible({ timeout: 1_500 }).catch(() => false))
    ) {
      return false;
    }

    console.log(
      "[QuestionnairePage] NHS 111 popup detected — clicking Book Private Consultation",
    );
    await popupButton.scrollIntoViewIfNeeded().catch(() => {});
    await popupButton.waitFor({ state: "visible", timeout: 10_000 });
    await popupButton.click({ force: true }).catch(async () => {
      await popupButton.evaluate((el: HTMLElement) => el.click());
    });

    await this.page.waitForLoadState("networkidle").catch(() => {});
    return true;
  }

  private async isOnPaymentPage(): Promise<boolean> {
    return this.page
      .locator(
        [
          ':text("Complete your payment")',
          ':text("Enter your card details here")',
          ':text("Select a saved card")',
          'input[autocomplete="cc-number"]',
          'button:has-text("Pay £")',
          'button:has-text("Pay")',
          ':text("Pass challenge")',
          ':text("3dsecure.io")',
        ].join(", "),
      )
      .first()
      .isVisible({ timeout: 300 })
      .catch(() => false);
  }
}
