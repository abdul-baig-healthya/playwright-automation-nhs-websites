export const TEST_USER = {
  gender: "male" as "male" | "female",
  dob: {
    day: "01",
    month: "01",
    year: "1990",
    /** ISO format used by Ant Design DatePicker */
    iso: "1990-01-01",
    /** Display format: DD/MM/YYYY */
    display: "01/01/1990",
  },
  firstName: "John",
  lastName: "Smith",
  postcode: "SW1A 1AA",
  genderValue: "male",
  email: "lloyd.p2@yopmail.com",
  guardianName: "Tonny stark",
  phone: "447467059973",
  payment: {
    cardholderName: "Jhon Smith",
    cardNumber: "4005519200000004",
    expiryDate: "01/32",
    securityCode: "123",
  },
};

export type ConditionJourneyType = "nhs" | "private" | "lifestyle";

export const CONDITION_CATALOG: Record<ConditionJourneyType, string> = {
  nhs: "shingles",
  private: "weight management",
  lifestyle: "erectile-dysfunction",
};

/**
 * On-demand condition selection:
 * Keep only one active line uncommented.
 */
export const ACTIVE_CONDITION = {
  // journeyType: "nhs" as ConditionJourneyType,
  journeyType: "private" as ConditionJourneyType,
  // journeyType: "lifestyle" as ConditionJourneyType,
};

export function getActiveConditionName(): string {
  return CONDITION_CATALOG[ACTIVE_CONDITION.journeyType];
}

export type AppointmentType = "Video" | "Face to Face" | "Phone call";

export interface BookingPreferences {
  appointmentType: AppointmentType;

  /**
   * If true:
   * - Select "next available slot"
   * - Skip manual month/date selection
   */
  useNextAvailableSlot: boolean;

  /**
   * Example:
   * "May 2026"
   * "June 2026"
   */
  preferredMonth?: string;

  /**
   * Example:
   * "15 Jun"
   * "20 May"
   */
  preferredDate?: string;

  /**
   * Preferred time label.
   * Example:
   * "03:20 PM"
   */
  preferredTime?: string;

  /**
   * Auto move next date using arrows
   * if slots unavailable
   */
  autoMoveToNextDate: boolean;

  /**
   * Max date navigation attempts
   */
  maxDateAttempts: number;
}

export const BOOKING_PREFERENCES: BookingPreferences = {
  appointmentType: "Video",

  useNextAvailableSlot: true,

  preferredMonth: "May 2026",

  preferredDate: "9 May",

  preferredTime: "07:00 AM",

  autoMoveToNextDate: true,

  maxDateAttempts: 10,
};
