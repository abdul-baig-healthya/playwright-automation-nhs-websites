export type ConditionQuestionRule = {
  questionPattern: RegExp;
  answerText: string;
  control: "radio" | "checkbox";
};

export const SHINGLES_RULES: ConditionQuestionRule[] = [
  {
    questionPattern:
      /Do you have any of below symptoms\. Check all that apply/i,
    answerText: "None of the above",
    control: "checkbox",
  },
  {
    questionPattern: /Please check all that apply to you\./i,
    answerText:
      "Presentation >7 days after rash onset (outside antiviral treatment window)",
    control: "checkbox",
  },
  {
    questionPattern: /Do you have these symptoms\?/i,
    answerText: "I do not have these symptoms",
    control: "radio",
  },
];

export const WEIGHT_MANAGEMENT_RULES: ConditionQuestionRule[] = [
  {
    questionPattern:
      /Do you take any medications currently, including over-the-counter, supplements, herbal remedies\?/i,
    answerText: "No",
    control: "radio",
  },
  {
    questionPattern:
      /Do you currently have any of these symptoms\? \(Select all that apply\)/i,
    answerText: "None of the above",
    control: "checkbox",
  },
  {
    questionPattern:
      /Have you experienced any of these since your last dose\? \(Select all that apply\)/i,
    answerText: "Have you had any signs or diagnoses of pancreatitis?",
    control: "checkbox",
  },
  {
    questionPattern:
      /Have you ever made yourself sick because you felt uncomfortably full\?/i,
    answerText: "Yes",
    control: "radio",
  },
  {
    questionPattern:
      /In the past 6 months, have you lost control over how much you eat\?/i,
    answerText: "Yes",
    control: "radio",
  },
  {
    questionPattern:
      /Have you recently lost more than one stone (6.3kg) in a three-month period\?/i,
    answerText: "Yes",
    control: "radio",
  },
  {
    questionPattern:
      /Do you frequently restrict eating to influence your shape or weight\?/i,
    answerText: "Yes",
    control: "radio",
  },
  {
    questionPattern: /Do you feel food dominates your life\?/i,
    answerText: "Yes",
    control: "radio",
  },
  {
    questionPattern:
      /Have friends or family expressed concerns about your eating patterns\?/i,
    answerText: "Yes",
    control: "radio",
  },
  {
    questionPattern: /Do you currently engage in binge eating episodes\?/i,
    answerText: "Yes",
    control: "radio",
  },
  {
    questionPattern: /Do you have any of these \? \(Tick all that apply\)/i,
    answerText: "None of the above",
    control: "checkbox",
  },
  {
    questionPattern:
      /Have you ever taken any medications to help manage your weight\?/i,
    answerText: "No",
    control: "radio",
  },
  {
    questionPattern:
      /Have you attempted any of the following\? \(Select all that apply\)/i,
    answerText: "None of the above",
    control: "checkbox",
  },
  {
    questionPattern: /How do you feel about making lifestyle changes\?/i,
    answerText: "Positive and motivated",
    control: "radio",
  },
  {
    questionPattern: /Have friends\/family offered support\?/i,
    answerText: "Yes",
    control: "radio",
  },
  {
    questionPattern: /Do you feel lifestyle changes alone could help\?/i,
    answerText: "Yes",
    control: "radio",
  },
  {
    questionPattern: /Risk Level assessment:/i,
    answerText: "Low Risk (0-1 red flags, BMI 30-35)",
    control: "radio",
  },
  {
    questionPattern: /Realistic weight loss expectations discussed:/i,
    answerText: "Yes",
    control: "radio",
  },
  {
    questionPattern: /Timeline for review appointment set:/i,
    answerText: "2 Weeks",
    control: "radio",
  },
];
