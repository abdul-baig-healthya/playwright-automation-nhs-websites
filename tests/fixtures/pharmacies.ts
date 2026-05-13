export interface PharmacySite {
  name: string;
  baseURL: string;
  /**
   * Sanity project ID used by the User Journey tests
   * (`tests/e2e/user-journey-flows.spec.ts`) to fetch condition metadata via
   * `https://{sanityProjectId}.api.sanity.io/v2026-05-13/data/query/dev?...`.
   *
   * **This is the single place to update Sanity project IDs.**
   * Leave empty + add a `// TODO` if unknown — the User Journey tests will
   * skip with a clear message instead of failing.
   */
  sanityProjectId?: string;
  /** Set to true for sites only reachable locally (e.g. localhost). Excluded when CI=true. */
  ciSkip?: boolean;
}

/**
 * Add or remove pharmacy sites here.
 * Each entry becomes a separate Playwright project — visible as a checkbox
 * in `playwright test --ui` and selectable via `--project="<name>"` on the CLI.
 */
export const PHARMACY_SITES: PharmacySite[] = [
  {
    name: "The Pharmacist",
    baseURL: "https://thepharmacist.healthya.co.uk/",
    sanityProjectId: "sorypy3x",
  },
  {
    name: "Pharmaease",
    baseURL: "https://pharmaease.healthya.co.uk/",
    sanityProjectId: "sorypy1x",
  },
  {
    name: "Paydens",
    baseURL: "https://paydens-pharmacy.healthya.co.uk/",
    sanityProjectId: "sorypy2x",
  },
  {
    name: "Localhost",
    baseURL: "http://localhost:4005",
    sanityProjectId: "sorypy4x",
    ciSkip: true,
  },
];
