import type { JourneyStep } from "./journey-types";

const SANITY_API_VERSION = "v2026-05-13";
const SANITY_DATASET = "dev";
const SANITY_PERSPECTIVE = "drafts";

const GROQ_QUERY = `*[_type == 'singleCondition' && conditionLogStatus != 'disabled' && status != 'disabled']{
  userJourneyFlow,
  title,
  conditionCategories,
  conditionId,
  corporateId
}`;

/**
 * Raw `userJourneyFlow` from Sanity is a keyed object with stringified
 * numeric keys, e.g. `{ "1": "sign_up", "2": "questionnaire_submit", ... }`.
 * We normalise to an ordered array.
 */
type RawUserJourneyFlow =
  | Record<string, string>
  | string[]
  | null
  | undefined;

export interface SanityCondition {
  title: string;
  conditionId: number | string;
  corporateId?: number | string;
  conditionCategories?: string;
  /** Normalised, ordered list of journey steps. */
  userJourneyFlow: JourneyStep[];
}

interface RawSanityCondition {
  title?: string;
  conditionId?: number | string;
  corporateId?: number | string;
  conditionCategories?: string;
  userJourneyFlow?: RawUserJourneyFlow;
}

export function normaliseUserJourneyFlow(
  raw: RawUserJourneyFlow,
): JourneyStep[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as JourneyStep[];
  return Object.keys(raw)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => raw[k] as JourneyStep);
}

function buildQueryUrl(projectId: string): string {
  const encoded = encodeURIComponent(GROQ_QUERY);
  return `https://${projectId}.api.sanity.io/${SANITY_API_VERSION}/data/query/${SANITY_DATASET}?query=${encoded}&perspective=${SANITY_PERSPECTIVE}`;
}

/**
 * Fetch all active singleCondition documents from Sanity for the given project.
 * Returns conditions with `userJourneyFlow` already normalised to an ordered array.
 */
export async function fetchConditions(
  projectId: string,
): Promise<SanityCondition[]> {
  if (!projectId) {
    throw new Error("fetchConditions: projectId is empty");
  }
  const url = buildQueryUrl(projectId);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Sanity query failed: HTTP ${res.status} ${res.statusText} for ${url}`,
    );
  }
  const json = (await res.json()) as { result?: RawSanityCondition[] };
  const items = json.result ?? [];
  return items.map((it) => ({
    title: it.title ?? "",
    conditionId: it.conditionId ?? "",
    corporateId: it.corporateId,
    conditionCategories: it.conditionCategories,
    userJourneyFlow: normaliseUserJourneyFlow(it.userJourneyFlow),
  }));
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Pick a single condition whose `userJourneyFlow` exactly matches the given
 * pattern (same length, same order). Random selection across matches unless
 * `USER_JOURNEY_CONDITION_ID` env var pins a specific conditionId.
 *
 * Throws with a clear message if no matches exist.
 */
export function pickConditionForFlow(
  conditions: SanityCondition[],
  pattern: JourneyStep[],
  context: { flowLabel: string; pharmacy: string },
): SanityCondition {
  const matches = conditions.filter((c) =>
    arraysEqual(c.userJourneyFlow, pattern),
  );

  if (matches.length === 0) {
    throw new Error(
      `No conditions found for flow "${context.flowLabel}" (${pattern.join(
        " → ",
      )}) on pharmacy "${context.pharmacy}". Sanity returned ${conditions.length} total condition(s).`,
    );
  }

  const pinnedId = process.env.USER_JOURNEY_CONDITION_ID;
  if (pinnedId) {
    const pinned = matches.find((c) => String(c.conditionId) === pinnedId);
    if (pinned) {
      console.log(
        `🔒 Pinned condition: ${pinned.title} (id=${pinned.conditionId})`,
      );
      return pinned;
    }
    console.log(
      `⚠ USER_JOURNEY_CONDITION_ID="${pinnedId}" not in flow matches — picking randomly`,
    );
  }

  const idx = Math.floor(Math.random() * matches.length);
  const chosen = matches[idx];
  console.log(
    `🎲 Picked ${chosen.title} (id=${chosen.conditionId}) at random from ${matches.length} flow match(es)`,
  );
  return chosen;
}

/**
 * Return ALL conditions in a randomised order (Fisher–Yates), with the pinned
 * id (USER_JOURNEY_CONDITION_ID) bubbled to the front when it matches. Used by
 * scenario specs (booking / payment) that don't filter by `userJourneyFlow`
 * but still want to retry across conditions on per-condition failures.
 */
export function shuffleConditions(
  conditions: SanityCondition[],
): SanityCondition[] {
  const shuffled = [...conditions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const pinnedId = process.env.USER_JOURNEY_CONDITION_ID;
  if (pinnedId) {
    const pinnedIdx = shuffled.findIndex(
      (c) => String(c.conditionId) === pinnedId,
    );
    if (pinnedIdx > 0) {
      const [pinned] = shuffled.splice(pinnedIdx, 1);
      shuffled.unshift(pinned);
    }
  }
  return shuffled;
}

/**
 * Return ALL conditions matching a flow pattern, in a randomised order so the
 * caller can iterate through fallbacks when the first pick isn't visible on
 * /conditions. The pinned id (if set + matching) is always returned first.
 */
export function getMatchingConditions(
  conditions: SanityCondition[],
  pattern: JourneyStep[],
): SanityCondition[] {
  const matches = conditions.filter((c) =>
    arraysEqual(c.userJourneyFlow, pattern),
  );
  // Fisher–Yates shuffle
  const shuffled = [...matches];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const pinnedId = process.env.USER_JOURNEY_CONDITION_ID;
  if (pinnedId) {
    const pinnedIdx = shuffled.findIndex(
      (c) => String(c.conditionId) === pinnedId,
    );
    if (pinnedIdx > 0) {
      const [pinned] = shuffled.splice(pinnedIdx, 1);
      shuffled.unshift(pinned);
    }
  }
  return shuffled;
}
