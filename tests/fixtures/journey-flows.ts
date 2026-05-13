import type { JourneyStep } from "../helpers/journey-types";

export type JourneyFlowId = "F1" | "F2" | "F3" | "F4" | "F5";

export interface JourneyFlowDef {
  id: JourneyFlowId;
  /** Dashboard-friendly label, also used in Sanity match error messages. */
  label: string;
  /**
   * Exact `userJourneyFlow` array to match in Sanity (same length, same order).
   */
  pattern: JourneyStep[];
  /**
   * Hardcoded execution sequence for the test. Currently identical to `pattern`,
   * but kept separate so we can prepend/append helper steps later
   * (e.g. eligibility / start-assessment are handled outside this list).
   */
  steps: JourneyStep[];
}

export const JOURNEY_FLOWS: JourneyFlowDef[] = [
  {
    id: "F1",
    label: "sign_up → questionnaire_submit → appointment_booking",
    pattern: ["sign_up", "questionnaire_submit", "appointment_booking"],
    steps: ["sign_up", "questionnaire_submit", "appointment_booking"],
  },
  {
    id: "F2",
    label: "questionnaire_submit → sign_up → appointment_booking",
    pattern: ["questionnaire_submit", "sign_up", "appointment_booking"],
    steps: ["questionnaire_submit", "sign_up", "appointment_booking"],
  },
  {
    id: "F3",
    label: "questionnaire_submit → appointment_booking → sign_up",
    pattern: ["questionnaire_submit", "appointment_booking", "sign_up"],
    steps: ["questionnaire_submit", "appointment_booking", "sign_up"],
  },
  {
    id: "F4",
    label: "sign_up → appointment_booking",
    pattern: ["sign_up", "appointment_booking"],
    steps: ["sign_up", "appointment_booking"],
  },
  {
    id: "F5",
    label: "appointment_booking → sign_up",
    pattern: ["appointment_booking", "sign_up"],
    steps: ["appointment_booking", "sign_up"],
  },
];
