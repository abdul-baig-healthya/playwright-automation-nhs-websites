import { test, expect, type APIRequestContext } from "@playwright/test";

// ── XML helpers ───────────────────────────────────────────────────────────────

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
    console.warn(
      `⚠ Could not fetch sitemap at ${sitemapUrl} (${res.status()})`,
    );
    return [];
  }

  const xml = await res.text();
  const locs = extractLocs(xml);

  if (xml.includes("<sitemapindex")) {
    const pageUrls: string[] = [];
    for (const childUrl of locs) {
      pageUrls.push(...(await fetchAllSitemapUrls(request, childUrl, visited)));
    }
    return pageUrls;
  }

  return locs;
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

function getTitle(html: string): string | null {
  return html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null;
}

// Two-step: find all <meta> tags, then match attr=value; handles any attribute order.
function getMetaContent(
  html: string,
  attr: "name" | "property",
  value: string,
): string | null {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const attrRe = new RegExp(`\\b${attr}\\s*=\\s*["']${escaped}["']`, "i");
  for (const tag of html.match(/<meta\b[^>]*?>/gi) ?? []) {
    if (!attrRe.test(tag)) continue;
    return tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
  }
  return null;
}

function getCanonicalHref(html: string): string | null {
  for (const tag of html.match(/<link\b[^>]*?>/gi) ?? []) {
    if (!/\brel\s*=\s*["']canonical["']/i.test(tag)) continue;
    return tag.match(/\bhref\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
  }
  return null;
}

// Returns parsed JSON-LD objects; empty array if none or invalid.
function parseStructuredData(html: string): object[] {
  const results: object[] = [];
  const re =
    /<script\b[^>]*?\btype\s*=\s*["']application\/ld\+json["'][^>]*?>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      results.push(JSON.parse(m[1]));
    } catch {
      /* invalid JSON */
    }
  }
  return results;
}

// Noindex if meta robots or X-Robots-Tag contains "noindex" or "none".
function isNoindex(html: string, headers: Record<string, string>): boolean {
  const robotsMeta = getMetaContent(html, "name", "robots") ?? "";
  const xRobots = headers["x-robots-tag"] ?? "";
  const directives = `${robotsMeta},${xRobots}`.toLowerCase().split(/[\s,]+/);
  return directives.some((d) => d === "noindex" || d === "none");
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.pathname !== "/" && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.href;
  } catch {
    return url;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PageResult {
  url: string;
  status: number;
  finalUrl: string;
  responseTime: number;
  headers: Record<string, string>;
  html: string;
  error: string | null;
}

const RESPONSE_THRESHOLD_MS = 5_000;

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe("Technical SEO", () => {
  let rawSitemapUrls: string[] = [];
  let uniqueUrls: string[] = [];
  let pages: PageResult[] = [];

  test.beforeAll(async ({ request, baseURL }) => {
    // Reset explicitly to prevent stale state bleeding between projects.
    rawSitemapUrls = [];
    uniqueUrls = [];
    pages = [];

    const sitemapUrl = new URL("sitemap.xml", baseURL!).href;
    rawSitemapUrls = await fetchAllSitemapUrls(request, sitemapUrl);
    uniqueUrls = [...new Set(rawSitemapUrls)];

    console.log(
      `\n🗺  Fetching ${uniqueUrls.length} unique URL(s) from sitemap…`,
    );

    pages = await Promise.all(
      uniqueUrls.map(async (url) => {
        const t0 = Date.now();

        try {
          const res = await request.get(url);

          console.log(`  → ${res.status()}  ${url}  (${Date.now() - t0}ms)`);

          return {
            url,
            status: res.status(),
            finalUrl: res.url(),
            responseTime: Date.now() - t0,
            headers: res.headers(),
            html: res.status() === 200 ? await res.text() : "",
            error: null,
          };
        } catch (err) {
          return {
            url,
            status: 0,
            finalUrl: url,
            responseTime: Date.now() - t0,
            headers: {},
            html: "",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );
  });

  // ── 1. sitemap.xml exists ─────────────────────────────────────────────────

  test("sitemap.xml exists", async ({ request, baseURL }) => {
    const sitemapUrl = new URL("sitemap.xml", baseURL!).href;
    const res = await request.get(sitemapUrl);

    expect(
      res.status(),
      `Expected sitemap at ${sitemapUrl} to return 200, got ${res.status()}`,
    ).toBe(200);
    expect(
      res.headers()["content-type"] ?? "",
      "Expected sitemap to be XML",
    ).toMatch(/xml/i);
  });

  // ── 2. sitemap URLs are unique ────────────────────────────────────────────

  test("sitemap URLs are unique", () => {
    test.skip(rawSitemapUrls.length === 0, "Sitemap returned no URLs");

    const urlCounts = new Map<string, number>();
    for (const url of rawSitemapUrls) {
      urlCounts.set(url, (urlCounts.get(url) ?? 0) + 1);
    }
    const dupes = [...urlCounts.entries()].filter(([, n]) => n > 1);

    expect(
      dupes,
      [
        `${dupes.length} duplicate URL(s) found in sitemap`,
        `(${rawSitemapUrls.length} total entries, ${urlCounts.size} unique):`,
        "",
        ...dupes.map(([url, n]) => `  ×${n}  ${url}`),
      ].join("\n"),
    ).toHaveLength(0);
  });

  // ── 3. sitemap URLs use HTTPS ─────────────────────────────────────────────

  test("sitemap URLs use HTTPS", () => {
    test.skip(uniqueUrls.length === 0, "Sitemap returned no URLs");

    const nonHttps = uniqueUrls.filter((u) => !u.startsWith("https://"));

    expect(
      nonHttps,
      [
        `${nonHttps.length} URL(s) in sitemap do not use HTTPS:`,
        "",
        ...nonHttps.map((u) => `  ${u}`),
      ].join("\n"),
    ).toHaveLength(0);
  });

  // ── 4. sitemap URLs return 200 ────────────────────────────────────────────

  test("sitemap URLs return 200", () => {
    test.skip(pages.length === 0, "No pages loaded");

    const failures = pages.filter((p) => p.status !== 200);

    expect(
      failures,
      [
        `${failures.length} URL(s) did not return HTTP 200:`,
        "",
        ...failures.map((p) =>
          p.error
            ? `  ERR  ${p.url}  (${p.error})`
            : `  HTTP ${p.status}  ${p.url}`,
        ),
      ].join("\n"),
    ).toHaveLength(0);
  });

  // ── 5. sitemap URLs do not redirect ──────────────────────────────────────

  test("sitemap URLs do not redirect", () => {
    test.skip(pages.length === 0, "No pages loaded");

    const redirects = pages.filter(
      (p) => normalizeUrl(p.finalUrl) !== normalizeUrl(p.url),
    );

    expect(
      redirects,
      [
        `${redirects.length} URL(s) in sitemap redirect to a different URL:`,
        "(Sitemap should list canonical, non-redirecting URLs)",
        "",
        ...redirects.map((p) => `  ${p.url}  →  ${p.finalUrl}`),
      ].join("\n"),
    ).toHaveLength(0);
  });

  // ── Page-level helpers ────────────────────────────────────────────────────

  function okPages(): PageResult[] {
    return pages.filter((p) => p.status === 200 && p.html.length > 0);
  }

  // ── 6. pages have titles ──────────────────────────────────────────────────

  test("pages have titles", () => {
    const loaded = okPages();
    test.skip(loaded.length === 0, "No 200 pages to inspect");

    const failures = loaded.filter((p) => {
      const t = getTitle(p.html);
      return !t || t.length === 0;
    });

    expect(
      failures,
      [
        `${failures.length} page(s) are missing a <title> tag:`,
        "",
        ...failures.map((p) => `  ${p.url}`),
      ].join("\n"),
    ).toHaveLength(0);
  });

  // ── 7. pages have meta descriptions ──────────────────────────────────────

  test("pages have meta descriptions", () => {
    const loaded = okPages();
    test.skip(loaded.length === 0, "No 200 pages to inspect");

    const failures = loaded.filter((p) => {
      const d = getMetaContent(p.html, "name", "description");
      return d === null || d.trim().length === 0;
    });

    expect(
      failures,
      [
        `${failures.length} page(s) are missing a meta description:`,
        "",
        ...failures.map((p) => `  ${p.url}`),
      ].join("\n"),
    ).toHaveLength(0);
  });

  // ── 8. pages have canonicals ──────────────────────────────────────────────

  test("pages have canonicals", () => {
    const loaded = okPages();
    test.skip(loaded.length === 0, "No 200 pages to inspect");

    const failures = loaded.filter((p) => {
      const href = getCanonicalHref(p.html);
      return href === null || href.trim().length === 0;
    });

    expect(
      failures,
      [
        `${failures.length} page(s) are missing a canonical link:`,
        "",
        ...failures.map((p) => `  ${p.url}`),
      ].join("\n"),
    ).toHaveLength(0);
  });

  // ── 9. pages are indexable ────────────────────────────────────────────────

  test("pages are indexable", () => {
    const loaded = okPages();
    test.skip(loaded.length === 0, "No 200 pages to inspect");

    const blocked = loaded.filter((p) => isNoindex(p.html, p.headers));

    expect(
      blocked,
      [
        `${blocked.length} page(s) listed in sitemap are marked noindex:`,
        "(Pages in the sitemap should be indexable)",
        "",
        ...blocked.map((p) => `  ${p.url}`),
      ].join("\n"),
    ).toHaveLength(0);
  });

  // ── 10. pages contain Open Graph tags ────────────────────────────────────

  test("pages contain Open Graph tags", () => {
    const loaded = okPages();
    test.skip(loaded.length === 0, "No 200 pages to inspect");

    const failures = loaded.flatMap((p) => {
      const missing = (["og:title", "og:description"] as const).filter(
        (prop) => getMetaContent(p.html, "property", prop) === null,
      );
      return missing.length ? [{ url: p.url, missing }] : [];
    });

    expect(
      failures,
      [
        `${failures.length} page(s) are missing required Open Graph tags:`,
        "",
        ...failures.map(
          (f) => `  ${f.url}  [missing: ${f.missing.join(", ")}]`,
        ),
      ].join("\n"),
    ).toHaveLength(0);
  });

  // ── 11. pages contain Twitter cards ──────────────────────────────────────

  test("pages contain Twitter cards", () => {
    const loaded = okPages();
    test.skip(loaded.length === 0, "No 200 pages to inspect");

    const failures = loaded.filter(
      (p) => getMetaContent(p.html, "name", "twitter:card") === null,
    );

    expect(
      failures,
      [
        `${failures.length} page(s) are missing the twitter:card meta tag:`,
        "",
        ...failures.map((p) => `  ${p.url}`),
      ].join("\n"),
    ).toHaveLength(0);
  });

  // ── 12. pages contain structured data ────────────────────────────────────

  test("pages contain structured data", () => {
    const loaded = okPages();
    test.skip(loaded.length === 0, "No 200 pages to inspect");

    const failures = loaded.filter(
      (p) => parseStructuredData(p.html).length === 0,
    );

    expect(
      failures,
      [
        `${failures.length} page(s) are missing valid JSON-LD structured data:`,
        "",
        ...failures.map((p) => `  ${p.url}`),
      ].join("\n"),
    ).toHaveLength(0);
  });

  // ── 13. pages respond within threshold ───────────────────────────────────

  test("pages respond within threshold", () => {
    test.skip(pages.length === 0, "No pages loaded");

    const slow = pages.filter((p) => p.responseTime > RESPONSE_THRESHOLD_MS);

    expect(
      slow,
      [
        `${slow.length} page(s) exceeded the ${RESPONSE_THRESHOLD_MS}ms response threshold:`,
        "",
        ...slow.map((p) => `  ${p.responseTime}ms  ${p.url}`),
      ].join("\n"),
    ).toHaveLength(0);
  });
});
