/**
 * Shared journey step union — used by both `condition-flow.spec.ts`
 * and `user-journey-flows.spec.ts`, and by `sanity-client.ts` when
 * normalising `userJourneyFlow` from Sanity.
 */
export type JourneyStep =
  | "guest_continue"
  | "product_signup"
  | "questionnaire_submit"
  | "sign_up"
  | "appointment_booking"
  | "drug_selection"
  | "cart"
  | "shipping_address"
  | "thank_you"
  | "payment"
  | "success"
  | "unknown";
