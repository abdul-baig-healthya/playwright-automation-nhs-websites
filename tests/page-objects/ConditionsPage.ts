import { Page, Locator } from "@playwright/test";

/**
 * Slugs or URL fragments that indicate a condition is for children / paediatrics.
 * These conditions have age-based eligibility that rejects adults — skip them.
 */
const CHILD_CONDITION_PATTERNS = [
  "children",
  "child",
  "paediatric",
  "pediatric",
  "infant",
  "baby",
  "toddler",
  "neonatal",
];

export class ConditionsPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    const corporateId = process.env.USER_JOURNEY_CORPORATE_ID;
    if (corporateId) {
      console.log(`[ConditionsPage] Selecting branch with corporateId: ${corporateId}`);
      await this.page.goto("/find-pharmacy");
      
      // Wait for any of the common card selectors to appear
      const cardSelector = await Promise.race([
        this.page.waitForSelector(".pharmacy-item", { timeout: 10000 }).then(() => ".pharmacy-item"),
        this.page.waitForSelector(".branch-card", { timeout: 10000 }).then(() => ".branch-card"),
        this.page.waitForSelector(".branch-item", { timeout: 10000 }).then(() => ".branch-item"),
        this.page.waitForSelector(".location-card", { timeout: 10000 }).then(() => ".location-card"),
        this.page.waitForSelector("div[class*=\"card\"] button", { timeout: 10000 }).then(() => "div[class*=\"card\"]"),
      ]).catch(() => ".pharmacy-item"); // fallback
      
      const cards = this.page.locator(cardSelector);
      const count = await cards.count();
      let clicked = false;
      
      for (let i = 0; i < count; i++) {
        const card = cards.nth(i);
        // Strategy A: data attributes matching any key related to ID/corporate/branch/pharmacy/location
        const dataId = await card.evaluate((el: any) => {
          for (const key of Object.keys(el.dataset)) {
            if (/id|corporate|branch|pharmacy|location/i.test(key)) {
              const val = el.dataset[key];
              if (val) return val;
            }
          }
          return el.dataset.id || el.dataset.corporateId || el.dataset.pharmacyId || null;
        });
        
        let cid = dataId ? String(dataId).trim() : null;
        
        // Strategy B: React fiber
        if (!cid) {
          cid = await card.evaluate((el: any) => {
            const fiberKey = Object.keys(el).find(k =>
              k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance")
            );
            if (!fiberKey) {
              console.log("[Fiber Diagnostics] No fiberKey found on element.");
              return null;
            }
            
            const cardText = el.innerText ? el.innerText.toLowerCase() : "";
            
            // Helper to recursively find arrays that look like lists of pharmacies/branches
            const scanPropsForList = (obj: any, visited = new Set()): any[] | null => {
              if (!obj || typeof obj !== "object" || visited.has(obj)) return null;
              visited.add(obj);
              
              if (Array.isArray(obj)) {
                const isPharmacyList = obj.some(item => {
                  if (!item || typeof item !== "object") return false;
                  const keys = Object.keys(item);
                  return keys.some(k => /^(corporateId|pharmacyId|branchId|id|uniqueNumber|pharmacySlug)$/i.test(k)) &&
                         keys.some(k => /^(name|title|line1|address|town|pincode)$/i.test(k));
                });
                if (isPharmacyList) return obj;
              }
              
              for (const key of Object.keys(obj)) {
                const val = obj[key];
                if (val && typeof val === "object") {
                  const found = scanPropsForList(val, visited);
                  if (found) return found;
                }
              }
              return null;
            };

            let curr = el[fiberKey];
            while (curr) {
              const props = curr.memoizedProps || curr.pendingProps;
              if (props) {
                // First check direct properties of props
                for (const key of Object.keys(props)) {
                  const val = props[key];
                  if (/^(id|corporateId|pharmacyId|branchId|branch|corporate|location|locationId)$/i.test(key)) {
                    if (val !== null && val !== undefined) {
                      if (typeof val === "string" || typeof val === "number") {
                        return String(val).trim();
                      }
                      if (typeof val === "object" && !Array.isArray(val)) {
                        for (const subKey of Object.keys(val)) {
                          if (/^(id|corporateId|pharmacyId|branchId|branch|corporate|location|locationId)$/i.test(subKey)) {
                            const subVal = val[subKey];
                            if (subVal !== null && subVal !== undefined && (typeof subVal === "string" || typeof subVal === "number")) {
                              return String(subVal).trim();
                            }
                          }
                        }
                      }
                    }
                  }
                }
                
                // Then scan for lists in props
                const list = scanPropsForList(props);
                if (list) {
                  for (const item of list) {
                    const name = String(item.name || item.title || "").toLowerCase();
                    const line1 = String(item.line1 || "").toLowerCase();
                    const town = String(item.town || "").toLowerCase();
                    const pincode = String(item.pincode || item.postcode || "").toLowerCase();
                    
                    const nameMatch = name && cardText.includes(name);
                    const lineMatch = line1 && cardText.includes(line1);
                    const townMatch = town && cardText.includes(town);
                    const pinMatch = pincode && cardText.replace(/\s+/g, "").includes(pincode.replace(/\s+/g, ""));
                    
                    if (nameMatch || lineMatch || townMatch || pinMatch) {
                      const foundId = item.corporateId || item.pharmacyId || item.branchId || item.id;
                      if (foundId !== undefined && foundId !== null) {
                        return String(foundId).trim();
                      }
                    }
                  }
                }
              }
              curr = curr.return;
            }
            return null;
          }).catch((err) => {
            console.log("[Fiber Diagnostics] evaluate failed:", err.message);
            return null;
          });
        }
        
        if (cid && String(cid).trim() === String(corporateId).trim()) {
          const btn = card.locator("button");
          const btnText = await btn.innerText().catch(() => "");
          if (btnText.toLowerCase().includes("selected")) {
            console.log(`[ConditionsPage] Branch ${corporateId} is already selected. Proceeding to /conditions.`);
            await this.page.goto("/conditions");
          } else {
            await btn.click();
          }
          clicked = true;
          break;
        }
      }
      
      // Strategy C: sequential clicks with request interception
      if (!clicked) {
        console.log(`[ConditionsPage] Could not find corporateId ${corporateId} in DOM/React fiber. Intercepting clicks.`);
        
        const extractIdFromUrl = (urlStr: string) => {
          try {
            const url = new URL(urlStr);
            const queryParams = [
              'id', 'corporateid', 'corporate_id', 'corporateId',
              'pharmacyid', 'pharmacy_id', 'pharmacyId',
              'branchid', 'branch_id', 'branchId',
              'branch', 'locationid', 'location_id', 'locationId'
            ];
            for (const param of queryParams) {
              const val = url.searchParams.get(param);
              if (val && /^\d+$/.test(val)) return parseInt(val, 10);
            }
            const segments = url.pathname.split('/').filter(Boolean);
            for (const seg of segments) {
              if (/^\d{3,8}$/.test(seg)) return parseInt(seg, 10);
            }
          } catch (e) {
            const m = urlStr.match(/[?&](id|corporateId|corporate_id|pharmacyId|pharmacy_id|branchId|branch_id|branch|locationId|location_id)=(\d+)/i);
            if (m) return parseInt(m[2], 10);
            const pm = urlStr.match(/\/(\d{3,8})(?:\/|\?|$)/);
            if (pm) return parseInt(pm[1], 10);
          }
          return null;
        };

        for (let i = 0; i < count; i++) {
          const card = cards.nth(i);
          const btn = card.locator("button");
          
          let matched = false;
          const requestPromise = this.page.waitForRequest(req => {
            const u = req.url();
            const cid = extractIdFromUrl(u);
            if (cid && String(cid) === String(corporateId)) {
              matched = true;
              return true;
            }
            return false;
          }, { timeout: 2500 }).catch(() => null);
          
          await btn.click();
          await requestPromise;
          if (matched) {
            clicked = true;
            break;
          }
        }
      }
      
      // Wait for navigation or load state
      await this.page.waitForURL("**/conditions**", { timeout: 10000 }).catch(() => {});
    } else {
      await this.page.goto("/conditions");
    }
    
    // Dismiss cookie consent banner if it appears (blocks condition card clicks)
    await this.page
      .locator(
        'button:has-text("Accept All"), button:has-text("Accept Cookies")',
      )
      .first()
      .click()
      .catch(() => {}); // silently skip if banner not present
  }

  /**
   * Wait for at least one condition card link to appear on the page.
   */
  async waitForConditions() {
    await this.page
      .locator('a[href*="/conditions/"]')
      .first()
      .waitFor({ state: "visible" });
  }

  /**
   * Returns all condition card anchor elements.
   */
  getAllConditionLinks(): Locator {
    return this.page.locator('a[href*="/conditions/"]');
  }

  /**
   * Returns the href of the first adult-appropriate condition card.
   * Skips children's/paediatric conditions since the test user is an adult (born 1990)
   * and those conditions reject adults at the eligibility check, preventing questionnaire.
   */
  async getFirstConditionHref(): Promise<string> {
    const links = this.getAllConditionLinks();
    const count = await links.count();

    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute("href");
      if (!href) continue;

      const slug = href.toLowerCase();
      const isChildCondition = CHILD_CONDITION_PATTERNS.some((pattern) =>
        slug.includes(pattern),
      );

      if (!isChildCondition) {
        return href;
      }
    }

    // Fallback: return the very first if all conditions match child patterns
    const firstHref = await links.first().getAttribute("href");
    if (!firstHref)
      throw new Error("No condition card link found on /conditions");
    return firstHref;
  }

  /**
   * Returns all adult-appropriate condition hrefs from the page, in shuffled order.
   * Skips children's/paediatric conditions so the adult test user passes eligibility.
   */
  async getAllAdultConditionHrefs(): Promise<string[]> {
    const links = this.getAllConditionLinks();
    const count = await links.count();
    const hrefs: string[] = [];

    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute("href");
      if (!href) continue;
      const slug = href.toLowerCase();
      const isChild = CHILD_CONDITION_PATTERNS.some((p) => slug.includes(p));
      if (!isChild) hrefs.push(href);
    }

    // Fisher-Yates shuffle
    for (let i = hrefs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [hrefs[i], hrefs[j]] = [hrefs[j], hrefs[i]];
    }

    return hrefs;
  }

  /**
   * Returns the href of the condition matching the given name (case-insensitive).
   * Searches for conditions containing the name in the href or text.
   */
  async getConditionHrefByName(name: string): Promise<string> {
    const links = this.getAllConditionLinks();
    const count = await links.count();

    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute("href");
      const text = await links.nth(i).innerText();
      if (!href) continue;

      const slug = href.toLowerCase();
      const conditionText = text.toLowerCase();
      if (
        slug.includes(name.toLowerCase()) ||
        conditionText.includes(name.toLowerCase())
      ) {
        return href;
      }
    }

    throw new Error(`Condition "${name}" not found on /conditions`);
  }

  /**
   * Extracts the pharmacy slug from a condition detail href.
   * Href format: /{pharmacySlug}/conditions/{conditionSlug}
   */
  extractPharmacySlug(href: string): string {
    // For full URLs, extract only the pathname before parsing
    let pathname = href;
    try {
      if (href.startsWith("http://") || href.startsWith("https://")) {
        pathname = new URL(href).pathname;
      }
    } catch {
      // fall through and use href as-is
    }

    // Strip hash fragment (e.g. /the-pharmacist/conditions/foo#productSection)
    const hrefNoHash = pathname.split("#")[0];
    const parts = hrefNoHash.replace(/^\//, "").split("/").filter(Boolean);

    // Handle both legacy /{pharmacySlug}/conditions/{conditionSlug}
    // and the current root /conditions/{conditionSlug} route.
    if (parts.length >= 3 && parts[parts.length - 2] === "conditions") {
      return parts[parts.length - 3];
    }

    if (parts.length >= 2 && parts[parts.length - 2] === "conditions") {
      return "";
    }

    if (parts.length === 1 && parts[0] !== "conditions") {
      // bare slug with no path prefix — no pharmacy slug
      return "";
    }

    // Fallback: if "conditions" appears anywhere in path, return the segment before it
    const condIdx = parts.indexOf("conditions");
    if (condIdx > 0) return parts[condIdx - 1];
    if (condIdx === 0) return "";

    throw new Error(
      `Unexpected condition href format: "${href}". Expected /{pharmacySlug}/conditions/{conditionSlug} or /conditions/{conditionSlug}`,
    );
  }

  /**
   * Click the condition card matching the given href.
   */
  async clickConditionByHref(href: string) {
    await this.page.locator(`a[href="${href}"]`).first().click();
  }

  /** @deprecated use getFirstConditionHref + clickConditionByHref */
  async clickFirstCondition() {
    await this.getAllConditionLinks().first().click();
  }

  /**
   * Types a search term into the health conditions search box and clicks Search.
   * Waits for results to appear after submission.
   */
  async searchCondition(term: string) {
    const searchInput = this.page.locator(
      'input[placeholder*="health conditions"], input[placeholder*="stomach ache"]',
    );
    await searchInput.waitFor({ state: "visible" });
    await searchInput.clear();
    await searchInput.fill(term);

    const searchButton = this.page.locator('button:has-text("Search")');
    await searchButton.click();

    // Wait for results to load after search
    await this.page
      .locator('a[href*="/conditions/"]')
      .first()
      .waitFor({ state: "visible" });
  }
}
